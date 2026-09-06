import type {
  AgentRun,
  AgentSpec,
  Benchmark,
  BenchmarkCase,
  CaseEvaluation,
  CriterionResult,
  EvaluationConcept,
  EvaluationCriterion,
  Evaluator,
  EvaluationReport,
  ExpectedStructuredField
} from "./types.js";

interface NormalizedText {
  raw: string;
  tokens: string[];
  tokenText: string;
}

export class KeywordEvaluator implements Evaluator {
  evaluate(agentSpec: AgentSpec, benchmark: Benchmark, runs: AgentRun[]): EvaluationReport {
    const runsByCaseId = new Map(runs.map((run) => [run.caseId, run]));

    const caseEvaluations: CaseEvaluation[] = benchmark.cases.map((benchmarkCase) =>
      evaluateCase(benchmarkCase, runsByCaseId.get(benchmarkCase.id), agentSpec.id)
    );

    const passedCases = caseEvaluations.filter((result) => result.passed).length;
    const totalCases = benchmark.cases.length;
    const totalScore = caseEvaluations.reduce((sum, result) => sum + result.overallScore, 0);

    return {
      benchmarkId: benchmark.id,
      agentSpecId: agentSpec.id,
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      accuracy: totalCases === 0 ? 0 : passedCases / totalCases,
      caseEvaluations,
      overallScore: totalCases === 0 ? 0 : totalScore / totalCases
    };
  }
}

function evaluateCase(benchmarkCase: BenchmarkCase, run: AgentRun | undefined, agentSpecId: string): CaseEvaluation {
  const output = run?.output ?? "";
  const normalized = normalizeText(output);
  const expected = benchmarkCase.expected;
  const criteria: CriterionResult[] = [];

  if (run?.status === "error" || !run) {
    criteria.push({
      id: "agent-run",
      type: "quality",
      passed: false,
      score: 0,
      weight: 1,
      explanation: run?.error ?? `No run output found for agent ${agentSpecId}.`
    });
  }

  if (expected.category) {
    criteria.push(evaluateCategory(expected.category, normalized));
  }

  const requiredConcepts = [
    ...(expected.requiredConcepts ?? []),
    ...(expected.mustInclude ?? []).map((term) => ({ name: term, aliases: [term] }))
  ];
  for (const concept of requiredConcepts) {
    criteria.push(evaluateRequiredConcept(concept, normalized));
  }

  const forbiddenContent = [
    ...(expected.forbiddenContent ?? []),
    ...(expected.mustNotInclude ?? []).map((term) => ({ name: term, aliases: [term] }))
  ];
  for (const concept of forbiddenContent) {
    criteria.push(evaluateForbiddenConcept(concept, normalized));
  }

  for (const qualityCriterion of expected.qualityCriteria ?? []) {
    criteria.push(evaluateQualityCriterion(qualityCriterion, normalized));
  }

  for (const field of expected.structuredFields ?? []) {
    criteria.push(evaluateStructuredField(field, normalized));
  }

  const weightedScore = scoreCriteria(criteria);
  const forbiddenViolations = criteria
    .filter((criterion) => criterion.type === "forbidden_content" && !criterion.passed)
    .map((criterion) => criterion.id);
  const missingRequiredConcepts = criteria
    .filter((criterion) => criterion.type === "required_concept" && !criterion.passed)
    .map((criterion) => criterion.id);
  const passThreshold = expected.passThreshold ?? 0.75;
  const passed = weightedScore >= passThreshold && forbiddenViolations.length === 0;

  return {
    caseId: benchmarkCase.id,
    score: weightedScore,
    overallScore: weightedScore,
    passed,
    criterionResults: criteria,
    missingRequiredTerms: missingRequiredConcepts,
    missingRequiredConcepts,
    forbiddenTermsFound: forbiddenViolations,
    forbiddenContentViolations: forbiddenViolations,
    expectedCategory: expected.category,
    detectedCategory: detectCategory(normalized),
    explanation: buildExplanation(weightedScore, passThreshold, missingRequiredConcepts, forbiddenViolations)
  };
}

function evaluateCategory(expectedCategory: string, normalized: NormalizedText): CriterionResult {
  const aliases = categoryAliases[expectedCategory] ?? [expectedCategory];
  const passed = aliases.some((alias) => containsPhrase(normalized, alias));

  return {
    id: expectedCategory,
    type: "category",
    passed,
    score: passed ? 1 : 0,
    weight: 1,
    explanation: passed
      ? `Detected category evidence for ${expectedCategory}.`
      : `No clear category evidence for ${expectedCategory}.`
  };
}

function evaluateRequiredConcept(concept: EvaluationConcept, normalized: NormalizedText): CriterionResult {
  const matchedAlias = concept.aliases.find((alias) => containsPhrase(normalized, alias));

  return {
    id: concept.name,
    type: "required_concept",
    passed: Boolean(matchedAlias),
    score: matchedAlias ? 1 : 0,
    weight: concept.weight ?? 1,
    explanation: matchedAlias
      ? `Matched required concept "${concept.name}" via "${matchedAlias}".`
      : `Missing required concept "${concept.name}".`
  };
}

function evaluateForbiddenConcept(concept: EvaluationConcept, normalized: NormalizedText): CriterionResult {
  const matchedAlias = concept.aliases.find((alias) => containsPhrase(normalized, alias));

  return {
    id: concept.name,
    type: "forbidden_content",
    passed: !matchedAlias,
    score: matchedAlias ? 0 : 1,
    weight: concept.weight ?? 1.5,
    explanation: matchedAlias
      ? `Found forbidden content "${concept.name}" via "${matchedAlias}".`
      : `Did not find forbidden content "${concept.name}".`
  };
}

function evaluateQualityCriterion(criterion: EvaluationCriterion, normalized: NormalizedText): CriterionResult {
  const allOfPassed = (criterion.allOf ?? []).every((term) => containsPhrase(normalized, term));
  const anyOf = criterion.anyOf ?? [];
  const anyOfPassed = anyOf.length === 0 || anyOf.some((term) => containsPhrase(normalized, term));
  const passed = allOfPassed && anyOfPassed;

  return {
    id: criterion.name,
    type: "quality",
    passed,
    score: passed ? 1 : 0,
    weight: criterion.weight ?? 0.5,
    explanation: passed ? `Met quality criterion "${criterion.name}".` : `Did not meet quality criterion "${criterion.name}".`
  };
}

function evaluateStructuredField(field: ExpectedStructuredField, normalized: NormalizedText): CriterionResult {
  const aliases = [field.name, ...(field.aliases ?? [])];
  const matchedAlias = aliases.find((alias) => containsStructuredField(normalized.raw, alias));
  const required = field.required ?? true;
  const passed = required ? Boolean(matchedAlias) : true;

  return {
    id: field.name,
    type: "structured_field",
    passed,
    score: passed ? 1 : 0,
    weight: field.weight ?? 0.75,
    explanation: matchedAlias
      ? `Found structured field "${field.name}".`
      : required
        ? `Missing required structured field "${field.name}".`
        : `Optional structured field "${field.name}" was not required.`
  };
}

function scoreCriteria(criteria: CriterionResult[]): number {
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  return criteria.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0) / totalWeight;
}

function buildExplanation(
  score: number,
  threshold: number,
  missingRequiredConcepts: string[],
  forbiddenViolations: string[]
): string {
  const failures = [
    missingRequiredConcepts.length > 0 ? `missing required concepts: ${missingRequiredConcepts.join(", ")}` : "",
    forbiddenViolations.length > 0 ? `forbidden content: ${forbiddenViolations.join(", ")}` : ""
  ].filter(Boolean);

  if (failures.length === 0 && score >= threshold) {
    return `Passed with score ${score.toFixed(2)}.`;
  }

  return `Failed with score ${score.toFixed(2)} against threshold ${threshold.toFixed(2)}${
    failures.length > 0 ? `; ${failures.join("; ")}` : ""
  }.`;
}

function detectCategory(normalized: NormalizedText): string | undefined {
  return Object.entries(categoryAliases).find(([, aliases]) => aliases.some((alias) => containsPhrase(normalized, alias)))?.[0];
}

function containsPhrase(normalized: NormalizedText, phrase: string): boolean {
  const phraseTokens = normalizeText(phrase).tokens;
  if (phraseTokens.length === 0) {
    return false;
  }

  return normalized.tokenText.includes(` ${phraseTokens.join(" ")} `);
}

function containsStructuredField(output: string, fieldName: string): boolean {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\n|[-*]\\s*)${escapedField}\\s*:`, "i").test(output);
}

function normalizeText(text: string): NormalizedText {
  const tokens = text
    .toLocaleLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken);

  return {
    raw: text,
    tokens,
    tokenText: ` ${tokens.join(" ")} `
  };
}

function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ing")) {
    return token.slice(0, -3);
  }
  if (token.length > 3 && token.endsWith("ed")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

const categoryAliases: Record<string, string[]> = {
  refunds: ["refund", "return", "money back"],
  billing: ["billing", "charge", "invoice", "statement", "payment"],
  shipping: ["shipping", "shipment", "package", "tracking", "delivery"],
  "account-access": ["account", "password", "sign in", "login", "locked"],
  security: ["security", "unauthorized", "secure", "accessed my account"],
  privacy: ["privacy", "personal data", "data deletion", "delete data"],
  "technical-troubleshooting": ["troubleshoot", "crash", "app", "api", "integration", "technical"],
  cancellation: ["cancel", "subscription", "renewal"],
  escalation: ["escalate", "specialist", "human agent", "review"],
  ambiguous: ["details", "clarify", "what happened", "more information"]
};
