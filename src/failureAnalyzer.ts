import type {
  AgentRun,
  AgentSpec,
  BenchmarkCase,
  CaseEvaluation,
  CriterionResult,
  EvaluationReport,
  FailureAnalysisReport,
  FailureAnalyzer,
  FailureEvidence,
  FailurePattern,
  FailurePatternType,
  FailureSeverity,
  ImprovementRecommendation,
  RootCause
} from "./types.js";

interface PatternDraft {
  type: FailurePatternType;
  criteria: Map<string, CriterionResult>;
  cases: Map<string, FailureEvidence[]>;
}

const patternDescriptions: Record<FailurePatternType, string> = {
  missing_required_information: "Missing required information across failed benchmark cases.",
  incorrect_classification: "Responses did not provide evidence for the expected category.",
  incomplete_response: "Responses did not satisfy required quality checks.",
  policy_violation: "Responses included forbidden or unsafe content.",
  escalation_failure: "Responses missed required escalation or specialist handoff evidence.",
  verification_failure: "Responses missed identity, policy, or accuracy verification evidence.",
  structured_field_failure: "Responses omitted required structured output fields.",
  run_failure: "Agent runs failed before producing evaluable output."
};

export class RuleBasedFailureAnalyzer implements FailureAnalyzer {
  analyze(
    agentSpec: AgentSpec,
    benchmarkCases: BenchmarkCase[],
    runResults: AgentRun[],
    evaluationReport: EvaluationReport
  ): FailureAnalysisReport {
    const casesById = new Map(benchmarkCases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]));
    const runsByCaseId = new Map(runResults.map((run) => [run.caseId, run]));
    const failedEvaluations = evaluationReport.caseEvaluations.filter((evaluation) => !evaluation.passed);
    const drafts = new Map<string, PatternDraft>();

    for (const evaluation of failedEvaluations) {
      const benchmarkCase = casesById.get(evaluation.caseId);
      const run = runsByCaseId.get(evaluation.caseId);

      for (const criterion of evaluation.criterionResults.filter((candidate) => !candidate.passed)) {
        const type = classifyFailure(criterion);
        const key = patternKey(type);
        const draft = drafts.get(key) ?? { type, criteria: new Map(), cases: new Map() };
        const evidence = buildEvidence(evaluation, criterion, benchmarkCase, run);

        draft.criteria.set(criterion.id, criterion);
        draft.cases.set(evaluation.caseId, [...(draft.cases.get(evaluation.caseId) ?? []), evidence]);
        drafts.set(key, draft);
      }
    }

    const patterns = Array.from(drafts.entries())
      .map(([key, draft]) => buildPattern(key, draft, evaluationReport.totalCases))
      .sort(comparePatterns);
    const rootCauses = buildRootCauses(patterns, agentSpec);
    const recommendations = buildRecommendations(patterns, rootCauses);
    const failedCases = buildLegacyFailureInsights(failedEvaluations, casesById);
    const failuresByTag = failedCases.reduce<Record<string, number>>((counts, failure) => {
      for (const tag of failure.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
      return counts;
    }, {});

    return {
      agentSpecId: evaluationReport.agentSpecId,
      benchmarkId: evaluationReport.benchmarkId,
      totalCases: evaluationReport.totalCases,
      totalFailedCases: failedEvaluations.length,
      failedCases,
      failuresByTag,
      patterns,
      rootCauses,
      recommendations,
      summary: buildSummary(failedEvaluations.length, evaluationReport.totalCases, patterns)
    };
  }
}

function classifyFailure(criterion: CriterionResult): FailurePatternType {
  if (criterion.id === "agent-run") {
    return "run_failure";
  }

  if (criterion.type === "forbidden_content") {
    return "policy_violation";
  }

  if (criterion.type === "category") {
    return "incorrect_classification";
  }

  if (criterion.type === "structured_field") {
    return "structured_field_failure";
  }

  const searchableText = [criterion.id, criterion.explanation].join(" ").toLocaleLowerCase();

  if (/\bescalat|specialist|handoff|priority/.test(searchableText)) {
    return "escalation_failure";
  }

  if (/\bverify|verification|identity|confirm|accuracy/.test(searchableText)) {
    return "verification_failure";
  }

  if (criterion.type === "quality") {
    return "incomplete_response";
  }

  return "missing_required_information";
}

function patternKey(type: FailurePatternType): string {
  return type;
}

function buildEvidence(
  evaluation: CaseEvaluation,
  criterion: CriterionResult,
  benchmarkCase: BenchmarkCase | undefined,
  run: AgentRun | undefined
): FailureEvidence {
  return {
    caseId: evaluation.caseId,
    criterionId: criterion.id,
    criterionType: criterion.type,
    explanation: criterion.explanation,
    outputExcerpt: excerpt(run?.output ?? ""),
    tags: benchmarkCase?.tags ?? []
  };
}

function buildPattern(key: string, draft: PatternDraft, totalCases: number): FailurePattern {
  const affectedCases = Array.from(draft.cases.keys()).sort();
  const failedCriteria = Array.from(draft.criteria.keys()).sort();
  const supportingEvidence = Array.from(draft.cases.values())
    .flatMap((evidence) => evidence)
    .sort((a, b) => a.caseId.localeCompare(b.caseId) || a.criterionId.localeCompare(b.criterionId));

  return {
    patternId: `pattern:${key}`,
    type: draft.type,
    description: describePattern(draft.type, affectedCases.length, totalCases, failedCriteria),
    affectedCases,
    frequency: affectedCases.length,
    severity: calculateSeverity(draft.type, affectedCases.length, totalCases),
    supportingEvidence,
    failedCriteria
  };
}

function describePattern(
  type: FailurePatternType,
  affectedCases: number,
  totalCases: number,
  failedCriteria: string[]
): string {
  const scope = `${affectedCases}/${totalCases} case${affectedCases === 1 ? "" : "s"}`;
  const criteria = failedCriteria.length > 0 ? ` Failed criteria: ${failedCriteria.join(", ")}.` : "";
  return `${patternDescriptions[type]} Affected ${scope}.${criteria}`;
}

function calculateSeverity(type: FailurePatternType, frequency: number, totalCases: number): FailureSeverity {
  if (frequency === 0) {
    return "low";
  }

  const ratio = totalCases === 0 ? 0 : frequency / totalCases;

  if (type === "policy_violation" && (frequency >= 3 || ratio >= 0.25)) {
    return "critical";
  }

  if (type === "policy_violation" || type === "run_failure" || ratio >= 0.5) {
    return "high";
  }

  if (frequency >= 2 || ratio >= 0.2) {
    return "medium";
  }

  return "low";
}

function buildRootCauses(patterns: FailurePattern[], agentSpec: AgentSpec): RootCause[] {
  const rootCauses: RootCause[] = [];
  const byType = new Map<FailurePatternType, FailurePattern[]>();

  for (const pattern of patterns) {
    byType.set(pattern.type, [...(byType.get(pattern.type) ?? []), pattern]);
  }

  addRootCause(rootCauses, byType.get("missing_required_information"), {
    hypothesis: "Task instructions do not consistently require the missing domain facts to be included.",
    confidenceBase: 0.65,
    evidencePrefix: "Missing required criteria",
    confidenceBoost: fieldIsSparse(agentSpec.taskInstructions) ? 0.15 : 0
  });
  addRootCause(rootCauses, byType.get("incorrect_classification"), {
    hypothesis: "Task instructions do not make category selection explicit enough for the benchmark taxonomy.",
    confidenceBase: 0.7,
    evidencePrefix: "Category criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.taskInstructions) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("incomplete_response"), {
    hypothesis: "System or task instructions under-specify the response completeness standard.",
    confidenceBase: 0.6,
    evidencePrefix: "Quality criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.systemInstructions) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("policy_violation"), {
    hypothesis: "System instructions do not provide strong enough boundaries against forbidden content.",
    confidenceBase: 0.75,
    evidencePrefix: "Forbidden-content criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.systemInstructions) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("escalation_failure"), {
    hypothesis: "Task instructions do not define when to escalate or route requests to specialists.",
    confidenceBase: 0.75,
    evidencePrefix: "Escalation-related criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.taskInstructions) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("verification_failure"), {
    hypothesis: "Verification instructions do not require identity, policy, or evidence checks before answering.",
    confidenceBase: 0.8,
    evidencePrefix: "Verification-related criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.verificationInstructions) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("structured_field_failure"), {
    hypothesis: "Output format does not specify all required structured fields.",
    confidenceBase: 0.8,
    evidencePrefix: "Structured-field criteria failed",
    confidenceBoost: fieldIsSparse(agentSpec.outputFormat) ? 0.1 : 0
  });
  addRootCause(rootCauses, byType.get("run_failure"), {
    hypothesis: "Agent execution failed before the evaluator could assess the response.",
    confidenceBase: 0.85,
    evidencePrefix: "Run failure criteria failed",
    confidenceBoost: 0
  });

  return rootCauses.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.relatedFailurePatterns.length - a.relatedFailurePatterns.length ||
      a.hypothesis.localeCompare(b.hypothesis)
  );
}

function addRootCause(
  rootCauses: RootCause[],
  patterns: FailurePattern[] | undefined,
  options: {
    hypothesis: string;
    confidenceBase: number;
    confidenceBoost: number;
    evidencePrefix: string;
  }
) {
  if (!patterns || patterns.length === 0) {
    return;
  }

  const affectedCases = new Set(patterns.flatMap((pattern) => pattern.affectedCases));
  const failedCriteria = Array.from(new Set(patterns.flatMap((pattern) => pattern.failedCriteria))).sort();

  rootCauses.push({
    hypothesis: options.hypothesis,
    supportingEvidence: [
      `${options.evidencePrefix} in ${affectedCases.size} case${affectedCases.size === 1 ? "" : "s"}.`,
      failedCriteria.length > 0 ? `Failed criteria: ${failedCriteria.join(", ")}.` : "No criterion identifiers were available."
    ],
    confidence: clampConfidence(options.confidenceBase + options.confidenceBoost + Math.min(patterns.length, 3) * 0.03),
    relatedFailurePatterns: patterns.map((pattern) => pattern.patternId).sort()
  });
}

function buildRecommendations(patterns: FailurePattern[], rootCauses: RootCause[]): ImprovementRecommendation[] {
  const patternIdsByType = new Map<FailurePatternType, string[]>();
  for (const pattern of patterns) {
    patternIdsByType.set(pattern.type, [...(patternIdsByType.get(pattern.type) ?? []), pattern.patternId]);
  }

  const recommendations: ImprovementRecommendation[] = [];
  addRecommendation(recommendations, patternIdsByType.get("missing_required_information"), {
    recommendation: "Add explicit coverage requirements for repeatedly missing required concepts.",
    targetAgentSpecField: "taskInstructions",
    reason: "Required-concept failures show the agent is omitting benchmark-required information.",
    expectedEffect: "Responses should include the missing domain facts more consistently."
  });
  addRecommendation(recommendations, patternIdsByType.get("incorrect_classification"), {
    recommendation: "Define the expected classification categories and require selecting the matching category.",
    targetAgentSpecField: "taskInstructions",
    reason: "Category failures show responses are not making the expected category evident.",
    expectedEffect: "Category evidence should align more often with benchmark expectations."
  });
  addRecommendation(recommendations, patternIdsByType.get("incomplete_response"), {
    recommendation: "Clarify the completeness bar for each response, including tone and concrete next steps.",
    targetAgentSpecField: "systemInstructions",
    reason: "Quality failures show responses are missing behavioral requirements beyond factual concepts.",
    expectedEffect: "Responses should satisfy more quality criteria without changing evaluator semantics."
  });
  addRecommendation(recommendations, patternIdsByType.get("policy_violation"), {
    recommendation: "Strengthen boundaries against forbidden claims, unsafe concessions, and dismissive language.",
    targetAgentSpecField: "systemInstructions",
    reason: "Forbidden-content failures are high-risk and directly supported by evaluator evidence.",
    expectedEffect: "Unsafe or policy-violating phrases should appear less often."
  });
  addRecommendation(recommendations, patternIdsByType.get("escalation_failure"), {
    recommendation: "Specify escalation triggers and required handoff language for complex or high-risk cases.",
    targetAgentSpecField: "taskInstructions",
    reason: "Escalation-related failures show the agent is not routing cases when expected.",
    expectedEffect: "Escalation cases should include specialist or team handoff evidence."
  });
  addRecommendation(recommendations, patternIdsByType.get("verification_failure"), {
    recommendation: "Require explicit verification checks before resolving sensitive, policy, or account-specific requests.",
    targetAgentSpecField: "verificationInstructions",
    reason: "Verification-related failures show missing identity, policy, or evidence checks.",
    expectedEffect: "Sensitive cases should include verification steps more reliably."
  });
  addRecommendation(recommendations, patternIdsByType.get("structured_field_failure"), {
    recommendation: "Update the output format to require every expected structured field by name.",
    targetAgentSpecField: "outputFormat",
    reason: "Structured-field failures show the response shape does not match benchmark expectations.",
    expectedEffect: "Structured outputs should become parseable by the evaluator."
  });
  addRecommendation(recommendations, patternIdsByType.get("run_failure"), {
    recommendation: "Inspect runner configuration, tool availability, and error handling for failed executions.",
    targetAgentSpecField: "tools",
    reason: "Run failures prevented normal response evaluation.",
    expectedEffect: "More benchmark cases should produce evaluable agent outputs."
  });

  const rootCausePatternIds = new Set(rootCauses.flatMap((rootCause) => rootCause.relatedFailurePatterns));
  return recommendations
    .filter((recommendation) =>
      recommendation.supportingFailurePatterns.some((patternId) => rootCausePatternIds.has(patternId))
    )
    .sort((a, b) => a.targetAgentSpecField.localeCompare(b.targetAgentSpecField));
}

function addRecommendation(
  recommendations: ImprovementRecommendation[],
  supportingFailurePatterns: string[] | undefined,
  options: Omit<ImprovementRecommendation, "supportingFailurePatterns">
) {
  if (!supportingFailurePatterns || supportingFailurePatterns.length === 0) {
    return;
  }

  recommendations.push({
    ...options,
    supportingFailurePatterns: supportingFailurePatterns.sort()
  });
}

function buildLegacyFailureInsights(
  failedEvaluations: CaseEvaluation[],
  casesById: Map<string, BenchmarkCase>
): FailureAnalysisReport["failedCases"] {
  return failedEvaluations.map((evaluation) => {
    const missing = evaluation.missingRequiredTerms;
    const forbidden = evaluation.forbiddenTermsFound;
    const reasonParts = [
      missing.length > 0 ? `missing required terms: ${missing.join(", ")}` : "",
      forbidden.length > 0 ? `included forbidden terms: ${forbidden.join(", ")}` : ""
    ].filter(Boolean);

    return {
      caseId: evaluation.caseId,
      tags: casesById.get(evaluation.caseId)?.tags ?? [],
      reason: reasonParts.join("; "),
      missingRequiredTerms: missing,
      forbiddenTermsFound: forbidden
    };
  });
}

function buildSummary(failedCaseCount: number, totalCases: number, patterns: FailurePattern[]): string {
  if (failedCaseCount === 0) {
    return "No benchmark failures found.";
  }

  const topPatterns = patterns
    .slice(0, 3)
    .map((pattern) => `${pattern.type.replace(/_/g, " ")} (${pattern.frequency}/${totalCases}, ${pattern.severity})`)
    .join("; ");

  return `${failedCaseCount}/${totalCases} benchmark case(s) failed. Top failure patterns: ${topPatterns}.`;
}

function comparePatterns(a: FailurePattern, b: FailurePattern): number {
  const severityDelta = severityRank(b.severity) - severityRank(a.severity);
  if (severityDelta !== 0) {
    return severityDelta;
  }

  return b.frequency - a.frequency || a.patternId.localeCompare(b.patternId);
}

function severityRank(severity: FailureSeverity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function fieldIsSparse(value: string | undefined): boolean {
  return !value || value.trim().split(/\s+/).filter(Boolean).length < 6;
}

function clampConfidence(value: number): number {
  return Math.min(0.95, Number(value.toFixed(2)));
}

function excerpt(output: string): string {
  const normalized = output.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }

  return `${normalized.slice(0, 157)}...`;
}
