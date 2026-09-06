import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerSupportBenchmark } from "../src/benchmark.js";
import { KeywordEvaluator } from "../src/evaluator.js";
import { RuleBasedFailureAnalyzer } from "../src/failureAnalyzer.js";
import { DeterministicMockAgentRunner, runBenchmark } from "../src/runner.js";
import type {
  AgentRun,
  AgentSpec,
  BenchmarkCase,
  CaseEvaluation,
  CriterionResult,
  EvaluationReport
} from "../src/types.js";

const agentSpec: AgentSpec = {
  id: "support-agent",
  name: "Support Agent",
  version: 1,
  role: "Customer support specialist",
  systemInstructions: "Help customers.",
  taskInstructions: "Handle support cases.",
  outputFormat: "Concise response.",
  verificationInstructions: "Check accuracy.",
  instructions: "Help customers.",
  capabilities: ["support"]
};

test("reports no patterns, root causes, or recommendations when there are no failures", () => {
  const cases = [benchmarkCase("case-1", ["billing"])];
  const report = reportWithEvaluations([caseEvaluation("case-1", true, [])]);

  const analysis = analyze(cases, report, [run("case-1", "category: billing\nnextStep: done")]);

  assert.equal(analysis.totalFailedCases, 0);
  assert.deepEqual(analysis.patterns, []);
  assert.deepEqual(analysis.rootCauses, []);
  assert.deepEqual(analysis.recommendations, []);
  assert.match(analysis.summary, /No benchmark failures/);
});

test("creates one pattern from a single evidence-backed failure", () => {
  const cases = [benchmarkCase("case-1", ["refunds"])];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [failedCriterion("refund-policy", "required_concept", "Missing required concept.")], {
      missingRequiredConcepts: ["refund-policy"]
    })
  ]);

  const analysis = analyze(cases, report, [run("case-1", "Sorry, please contact support.")]);

  assert.equal(analysis.patterns.length, 1);
  assert.equal(analysis.patterns[0]?.type, "missing_required_information");
  assert.deepEqual(analysis.patterns[0]?.affectedCases, ["case-1"]);
  assert.equal(analysis.patterns[0]?.frequency, 1);
  assert.equal(analysis.patterns[0]?.supportingEvidence[0]?.outputExcerpt, "Sorry, please contact support.");
  assert.equal(analysis.patterns[0]?.failedCriteria[0], "refund-policy");
});

test("aggregates repeated failures into one reusable pattern", () => {
  const cases = [benchmarkCase("case-1", ["security"]), benchmarkCase("case-2", ["privacy"])];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [failedCriterion("identity-verification", "required_concept")], {
      missingRequiredConcepts: ["identity-verification"]
    }),
    caseEvaluation("case-2", false, [failedCriterion("identity-verification", "required_concept")], {
      missingRequiredConcepts: ["identity-verification"]
    })
  ]);

  const analysis = analyze(cases, report, [
    run("case-1", "I can help with that."),
    run("case-2", "I can send the data.")
  ]);

  assert.equal(analysis.patterns.length, 1);
  assert.equal(analysis.patterns[0]?.patternId, "pattern:verification_failure");
  assert.equal(analysis.patterns[0]?.frequency, 2);
  assert.deepEqual(analysis.patterns[0]?.affectedCases, ["case-1", "case-2"]);
});

test("detects multiple failure patterns from different criterion types", () => {
  const cases = [benchmarkCase("case-1", ["billing"]), benchmarkCase("case-2", ["structured"])];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [
      failedCriterion("billing", "category", "No clear category evidence."),
      failedCriterion("dismissive-language", "forbidden_content", "Found forbidden content.")
    ]),
    caseEvaluation("case-2", false, [failedCriterion("nextStep", "structured_field", "Missing required structured field.")])
  ]);

  const analysis = analyze(cases, report, [
    run("case-1", "Calm down."),
    run("case-2", "category: billing")
  ]);
  const patternTypes = analysis.patterns.map((pattern) => pattern.type).sort();

  assert.deepEqual(patternTypes, ["incorrect_classification", "policy_violation", "structured_field_failure"]);
});

test("calculates severity deterministically from risk and frequency", () => {
  const cases = [
    benchmarkCase("case-1", ["policy"]),
    benchmarkCase("case-2", ["policy"]),
    benchmarkCase("case-3", ["policy"]),
    benchmarkCase("case-4", ["other"])
  ];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [failedCriterion("unsafe-disclosure", "forbidden_content")]),
    caseEvaluation("case-2", false, [failedCriterion("unsafe-disclosure", "forbidden_content")]),
    caseEvaluation("case-3", false, [failedCriterion("unsafe-disclosure", "forbidden_content")]),
    caseEvaluation("case-4", true, [])
  ]);

  const analysis = analyze(cases, report, [
    run("case-1", "no verification"),
    run("case-2", "no verification"),
    run("case-3", "no verification"),
    run("case-4", "ok")
  ]);

  assert.equal(analysis.patterns[0]?.type, "policy_violation");
  assert.equal(analysis.patterns[0]?.severity, "critical");
});

test("generates root causes from related failure patterns", () => {
  const cases = [benchmarkCase("case-1", ["privacy"])];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [failedCriterion("identity-verification", "required_concept")], {
      missingRequiredConcepts: ["identity-verification"]
    })
  ]);

  const analysis = analyze(cases, report, [run("case-1", "Here is the data.")]);

  assert.equal(analysis.rootCauses.length, 1);
  assert.match(analysis.rootCauses[0]?.hypothesis ?? "", /Verification instructions/);
  assert.ok((analysis.rootCauses[0]?.confidence ?? 0) > 0.8);
  assert.deepEqual(analysis.rootCauses[0]?.relatedFailurePatterns, ["pattern:verification_failure"]);
});

test("generates structured recommendations without modifying the AgentSpec", () => {
  const cases = [benchmarkCase("case-1", ["structured"])];
  const report = reportWithEvaluations([
    caseEvaluation("case-1", false, [failedCriterion("nextStep", "structured_field")])
  ]);
  const before = JSON.stringify(agentSpec);

  const analysis = analyze(cases, report, [run("case-1", "category: billing")]);

  assert.equal(JSON.stringify(agentSpec), before);
  assert.equal(analysis.recommendations.length, 1);
  assert.equal(analysis.recommendations[0]?.targetAgentSpecField, "outputFormat");
  assert.deepEqual(analysis.recommendations[0]?.supportingFailurePatterns, ["pattern:structured_field_failure"]);
});

test("integrates benchmark, runner results, evaluator, and failure analyzer", async () => {
  const benchmark = createCustomerSupportBenchmark();
  const runs = await runBenchmark(new DeterministicMockAgentRunner(), agentSpec, benchmark.cases);
  const evaluationReport = new KeywordEvaluator().evaluate(agentSpec, benchmark, runs);
  const analysis = new RuleBasedFailureAnalyzer().analyze(agentSpec, benchmark.cases, runs, evaluationReport);

  assert.equal(analysis.benchmarkId, benchmark.id);
  assert.equal(analysis.agentSpecId, agentSpec.id);
  assert.equal(analysis.totalFailedCases, evaluationReport.failedCases);
  assert.ok(analysis.patterns.length > 0);
  assert.ok(analysis.patterns.every((pattern) => pattern.frequency === pattern.affectedCases.length));
  assert.ok(analysis.rootCauses.length > 0);
  assert.ok(analysis.recommendations.length > 0);
});

function analyze(benchmarkCases: BenchmarkCase[], evaluationReport: EvaluationReport, runs: AgentRun[]) {
  return new RuleBasedFailureAnalyzer().analyze(agentSpec, benchmarkCases, runs, evaluationReport);
}

function benchmarkCase(id: string, tags: string[]): BenchmarkCase {
  return {
    id,
    input: `Input for ${id}`,
    tags,
    expected: {}
  };
}

function run(caseId: string, output: string): AgentRun {
  return {
    caseId,
    input: `Input for ${caseId}`,
    output,
    agentSpecId: agentSpec.id
  };
}

function failedCriterion(
  id: string,
  type: CriterionResult["type"],
  explanation = `Failed ${id}.`
): CriterionResult {
  return {
    id,
    type,
    passed: false,
    score: 0,
    weight: 1,
    explanation
  };
}

function caseEvaluation(
  caseId: string,
  passed: boolean,
  criterionResults: CriterionResult[],
  options: {
    missingRequiredConcepts?: string[];
    forbiddenContentViolations?: string[];
  } = {}
): CaseEvaluation {
  return {
    caseId,
    score: passed ? 1 : 0,
    overallScore: passed ? 1 : 0,
    passed,
    criterionResults,
    missingRequiredTerms: options.missingRequiredConcepts ?? [],
    missingRequiredConcepts: options.missingRequiredConcepts ?? [],
    forbiddenTermsFound: options.forbiddenContentViolations ?? [],
    forbiddenContentViolations: options.forbiddenContentViolations ?? [],
    explanation: passed ? "Passed fixture." : "Failed fixture."
  };
}

function reportWithEvaluations(caseEvaluations: CaseEvaluation[]): EvaluationReport {
  const passedCases = caseEvaluations.filter((evaluation) => evaluation.passed).length;

  return {
    benchmarkId: "benchmark",
    agentSpecId: agentSpec.id,
    totalCases: caseEvaluations.length,
    passedCases,
    failedCases: caseEvaluations.length - passedCases,
    accuracy: caseEvaluations.length === 0 ? 0 : passedCases / caseEvaluations.length,
    overallScore:
      caseEvaluations.length === 0
        ? 0
        : caseEvaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0) / caseEvaluations.length,
    caseEvaluations
  };
}
