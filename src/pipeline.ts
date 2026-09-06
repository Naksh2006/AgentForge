import type {
  AgentDesigner,
  AgentImprover,
  AgentRunner,
  Benchmark,
  Evaluator,
  FailureAnalyzer,
  Task
} from "./types.js";
import { runBenchmark } from "./runner.js";
import { RegressionGuard } from "./regressionGuard.js";

export interface AgentForgeDependencies {
  designer: AgentDesigner;
  runner: AgentRunner;
  evaluator: Evaluator;
  failureAnalyzer: FailureAnalyzer;
  improver: AgentImprover;
  regressionGuard: RegressionGuard;
}

export async function runAgentForgeVerticalSlice(
  task: Task,
  benchmark: Benchmark,
  dependencies: AgentForgeDependencies
) {
  const agentSpec = await dependencies.designer.design(task);
  const runs = await runBenchmark(dependencies.runner, agentSpec, benchmark.cases);
  const evaluation = dependencies.evaluator.evaluate(agentSpec, benchmark, runs);
  const failureAnalysis = dependencies.failureAnalyzer.analyze(agentSpec, benchmark.cases, runs, evaluation);
  const improvement = await dependencies.improver.proposeImprovement(agentSpec, failureAnalysis);
  const candidateRuns = await runBenchmark(dependencies.runner, improvement.proposedAgentSpec, benchmark.cases);
  const candidateEvaluation = dependencies.evaluator.evaluate(improvement.proposedAgentSpec, benchmark, candidateRuns);
  const regression = dependencies.regressionGuard.compare(evaluation, candidateEvaluation);

  return {
    task,
    agentSpec,
    benchmark,
    runs,
    evaluation,
    failureAnalysis,
    improvement,
    candidateEvaluation,
    regression
  };
}
