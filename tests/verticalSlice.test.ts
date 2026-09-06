import assert from "node:assert/strict";
import test from "node:test";
import { BasicAgentDesigner } from "../src/agentDesigner.js";
import { createCustomerSupportBenchmark } from "../src/benchmark.js";
import { KeywordEvaluator } from "../src/evaluator.js";
import { RuleBasedFailureAnalyzer } from "../src/failureAnalyzer.js";
import { InstructionAppendingImprover } from "../src/improver.js";
import { runAgentForgeVerticalSlice } from "../src/pipeline.js";
import { RegressionGuard } from "../src/regressionGuard.js";
import { DeterministicMockAgentRunner } from "../src/runner.js";
import type { EvaluationReport, Task } from "../src/types.js";

test("runs the customer support vertical slice end to end with calculated metrics", async () => {
  const task: Task = {
    id: "customer-support-agent",
    description: "Create an agent that handles common customer support requests accurately and politely."
  };

  const result = await runAgentForgeVerticalSlice(task, createCustomerSupportBenchmark(), {
    designer: new BasicAgentDesigner(),
    runner: new DeterministicMockAgentRunner(),
    evaluator: new KeywordEvaluator(),
    failureAnalyzer: new RuleBasedFailureAnalyzer(),
    improver: new InstructionAppendingImprover(),
    regressionGuard: new RegressionGuard(0.8)
  });

  assert.equal(result.benchmark.cases.length, 18);
  assert.equal(result.evaluation.totalCases, 18);
  assert.equal(result.evaluation.caseEvaluations.length, 18);
  assert.ok(result.evaluation.overallScore >= 0);
  assert.ok(result.evaluation.overallScore <= 1);
  assert.ok(result.evaluation.caseEvaluations.every((evaluation) => evaluation.criterionResults.length > 0));
  assert.equal(
    result.failureAnalysis.failedCases.length,
    result.evaluation.caseEvaluations.filter((evaluation) => !evaluation.passed).length
  );
});

test("regression guard fails when a candidate loses a previously passing case", () => {
  const baseline = reportWithCases("baseline", [
    ["refund-window", true],
    ["late-shipment", true]
  ]);
  const candidate = reportWithCases("candidate", [
    ["refund-window", false],
    ["late-shipment", true]
  ]);

  const result = new RegressionGuard(0.5).compare(baseline, candidate);

  assert.equal(result.passed, false);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0]?.caseId, "refund-window");
});

function reportWithCases(agentSpecId: string, cases: Array<[string, boolean]>): EvaluationReport {
  const passedCases = cases.filter(([, passed]) => passed).length;

  return {
    benchmarkId: "benchmark",
    agentSpecId,
    totalCases: cases.length,
    passedCases,
    failedCases: cases.length - passedCases,
    accuracy: passedCases / cases.length,
    overallScore: passedCases / cases.length,
    caseEvaluations: cases.map(([caseId, passed]) => ({
      caseId,
      score: passed ? 1 : 0,
      overallScore: passed ? 1 : 0,
      passed,
      criterionResults: [
        {
          id: "fixture",
          type: "required_concept",
          passed,
          score: passed ? 1 : 0,
          weight: 1,
          explanation: passed ? "fixture passed" : "fixture failed"
        }
      ],
      missingRequiredTerms: passed ? [] : ["required"],
      missingRequiredConcepts: passed ? [] : ["required"],
      forbiddenTermsFound: [],
      forbiddenContentViolations: [],
      explanation: passed ? "Passed fixture." : "Failed fixture."
    }))
  };
}
