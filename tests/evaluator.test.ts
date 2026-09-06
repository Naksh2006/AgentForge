import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerSupportBenchmark } from "../src/benchmark.js";
import { KeywordEvaluator } from "../src/evaluator.js";
import type { AgentSpec, Benchmark, BenchmarkCase } from "../src/types.js";

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

test("customer support benchmark has structured criteria and expected size", () => {
  const benchmark = createCustomerSupportBenchmark();

  assert.equal(benchmark.cases.length, 18);
  assert.ok(benchmark.cases.every((benchmarkCase) => benchmarkCase.expected.category));
  assert.ok(benchmark.cases.every((benchmarkCase) => (benchmarkCase.expected.requiredConcepts ?? []).length >= 3));
  assert.ok(benchmark.cases.some((benchmarkCase) => benchmarkCase.tags.includes("difficult")));
});

test("evaluator reports criterion-level breakdown for a passing response", () => {
  const benchmarkCase = createCustomerSupportBenchmark().cases.find((candidate) => candidate.id === "refund-window")!;
  const report = evaluateSingleCase(
    benchmarkCase,
    "Sorry this did not work out. Refund requests are available within 30 days; please send your order number."
  );
  const evaluation = report.caseEvaluations[0]!;

  assert.equal(evaluation.passed, true);
  assert.ok(evaluation.overallScore >= 0.75);
  assert.equal(evaluation.missingRequiredConcepts.length, 0);
  assert.equal(evaluation.forbiddenContentViolations.length, 0);
  assert.ok(evaluation.criterionResults.some((criterion) => criterion.type === "category" && criterion.passed));
  assert.ok(evaluation.criterionResults.some((criterion) => criterion.id === "30-day-window" && criterion.passed));
});

test("evaluator detects missing concepts and forbidden content", () => {
  const benchmarkCase = createCustomerSupportBenchmark().cases.find((candidate) => candidate.id === "angry-customer")!;
  const report = evaluateSingleCase(benchmarkCase, "Calm down. This is not our problem.");
  const evaluation = report.caseEvaluations[0]!;

  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.missingRequiredConcepts.includes("apology"));
  assert.ok(evaluation.missingRequiredConcepts.includes("troubleshooting"));
  assert.ok(evaluation.forbiddenContentViolations.includes("dismissive-language"));
  assert.match(evaluation.explanation, /forbidden content/);
});

test("evaluator supports expected structured fields", () => {
  const benchmarkCase: BenchmarkCase = {
    id: "structured-output",
    input: "Triage this request.",
    tags: ["structured"],
    expected: {
      category: "billing",
      requiredConcepts: [{ name: "billing-issue", aliases: ["billing"] }],
      structuredFields: [{ name: "category" }, { name: "nextStep", aliases: ["next step"] }],
      passThreshold: 0.75
    }
  };
  const report = evaluateSingleCase(benchmarkCase, "category: billing\nnextStep: please check the invoice.");
  const evaluation = report.caseEvaluations[0]!;

  assert.equal(evaluation.passed, true);
  assert.ok(evaluation.criterionResults.some((criterion) => criterion.type === "structured_field" && criterion.passed));
});

function evaluateSingleCase(benchmarkCase: BenchmarkCase, output: string) {
  const benchmark: Benchmark = {
    id: "test-benchmark",
    name: "Test Benchmark",
    description: "Test benchmark",
    cases: [benchmarkCase]
  };

  return new KeywordEvaluator().evaluate(agentSpec, benchmark, [
    {
      caseId: benchmarkCase.id,
      input: benchmarkCase.input,
      output,
      agentSpecId: agentSpec.id
    }
  ]);
}
