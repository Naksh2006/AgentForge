import type { AgentRun, AgentSpec, Benchmark, CaseEvaluation, Evaluator, EvaluationReport } from "./types.js";

function includesTerm(output: string, term: string): boolean {
  return output.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

export class KeywordEvaluator implements Evaluator {
  evaluate(agentSpec: AgentSpec, benchmark: Benchmark, runs: AgentRun[]): EvaluationReport {
    const runsByCaseId = new Map(runs.map((run) => [run.caseId, run]));

    const caseEvaluations: CaseEvaluation[] = benchmark.cases.map((benchmarkCase) => {
      const run = runsByCaseId.get(benchmarkCase.id);
      const output = run?.output ?? "";
      const missingRequiredTerms = benchmarkCase.expected.mustInclude.filter((term) => !includesTerm(output, term));
      const forbiddenTermsFound = (benchmarkCase.expected.mustNotInclude ?? []).filter((term) => includesTerm(output, term));
      const passed = missingRequiredTerms.length === 0 && forbiddenTermsFound.length === 0;

      return {
        caseId: benchmarkCase.id,
        score: passed ? 1 : 0,
        passed,
        missingRequiredTerms,
        forbiddenTermsFound
      };
    });

    const passedCases = caseEvaluations.filter((result) => result.passed).length;
    const totalCases = benchmark.cases.length;

    return {
      benchmarkId: benchmark.id,
      agentSpecId: agentSpec.id,
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      accuracy: totalCases === 0 ? 0 : passedCases / totalCases,
      caseEvaluations
    };
  }
}
