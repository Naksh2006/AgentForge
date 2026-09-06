import { BasicAgentDesigner } from "./agentDesigner.js";
import { createCustomerSupportBenchmark } from "./benchmark.js";
import { KeywordEvaluator } from "./evaluator.js";
import { RuleBasedFailureAnalyzer } from "./failureAnalyzer.js";
import { InstructionAppendingImprover } from "./improver.js";
import { LlmAgentDesigner } from "./llmAgentDesigner.js";
import { LlmAgentRunner } from "./llmAgentRunner.js";
import { createLlmProviderFromEnv, readLlmConfigFromEnv } from "./llmProvider.js";
import { runAgentForgeVerticalSlice } from "./pipeline.js";
import { RegressionGuard } from "./regressionGuard.js";
import { DeterministicMockAgentRunner } from "./runner.js";
import type { Task } from "./types.js";

const task: Task = {
  id: "customer-support-agent",
  description: "Create an agent that handles common customer support requests accurately and politely."
};

const benchmark = createCustomerSupportBenchmark();
const llmConfig = readLlmConfigFromEnv();
const llmProvider = createLlmProviderFromEnv();
const designer = llmProvider ? new LlmAgentDesigner(llmProvider) : new BasicAgentDesigner();
const useLlmRunner = llmProvider && process.env.AGENTFORGE_DEMO_LLM_RUNNER === "true";
const printFailureAnalysis = process.env.AGENTFORGE_DEMO_FAILURE_ANALYSIS === "true";
const runner = useLlmRunner ? new LlmAgentRunner(llmProvider, { timeoutMs: 30_000 }) : new DeterministicMockAgentRunner();

const result = await runAgentForgeVerticalSlice(task, benchmark, {
  designer,
  runner,
  evaluator: new KeywordEvaluator(),
  failureAnalyzer: new RuleBasedFailureAnalyzer(),
  improver: new InstructionAppendingImprover(),
  regressionGuard: new RegressionGuard(0.8)
});

console.log("AgentForge vertical slice demo");
console.log(
  `LLM config: ${llmConfig.configured ? "configured" : "missing"}; model=${llmConfig.model}; keySource=${
    llmConfig.apiKeySource ?? "none"
  }`
);
console.log(`Designer mode: ${llmProvider ? "llm" : "deterministic"}`);
console.log(`Runner mode: ${useLlmRunner ? "llm" : "deterministic"}`);
console.log(`Task: ${result.task.description}`);
console.log(`AgentSpec: ${result.agentSpec.name} (${result.agentSpec.id})`);
console.log(`Role: ${result.agentSpec.role}`);
console.log(`Benchmark: ${result.benchmark.name}`);
console.log("");
console.log("Case results:");
for (const evaluation of result.evaluation.caseEvaluations) {
  const status = evaluation.passed ? "PASS" : "FAIL";
  const details = evaluation.passed
    ? ""
    : ` missing=[${evaluation.missingRequiredTerms.join(", ")}] forbidden=[${evaluation.forbiddenTermsFound.join(", ")}]`;
  console.log(`- ${evaluation.caseId}: ${status}${details}`);
}
console.log("");
console.log(
  `Initial score: ${result.evaluation.passedCases}/${result.evaluation.totalCases} (${Math.round(
    result.evaluation.accuracy * 100
  )}%)`
);
console.log(`Failure analysis: ${result.failureAnalysis.summary}`);
if (printFailureAnalysis) {
  console.log("");
  console.log("Failure Patterns:");
  for (const pattern of result.failureAnalysis.patterns) {
    console.log(
      `- ${pattern.patternId}: ${pattern.description} severity=${pattern.severity}; cases=[${pattern.affectedCases.join(
        ", "
      )}]`
    );
  }

  console.log("");
  console.log("Root Causes:");
  for (const rootCause of result.failureAnalysis.rootCauses) {
    console.log(
      `- ${rootCause.hypothesis} confidence=${rootCause.confidence}; patterns=[${rootCause.relatedFailurePatterns.join(
        ", "
      )}]`
    );
  }

  console.log("");
  console.log("Recommendations:");
  for (const recommendation of result.failureAnalysis.recommendations) {
    console.log(
      `- ${recommendation.targetAgentSpecField}: ${recommendation.recommendation} Expected effect: ${recommendation.expectedEffect}`
    );
  }
}
console.log(`Improvement proposal: ${result.improvement.rationale.join(" ")}`);
console.log(
  `Regression guard: ${result.regression.passed ? "PASS" : "FAIL"} (baseline ${Math.round(
    result.regression.baselineAccuracy * 100
  )}%, candidate ${Math.round(result.regression.candidateAccuracy * 100)}%, minimum ${Math.round(
    result.regression.minimumAccuracy * 100
  )}%)`
);
