import type { CaseEvaluation, EvaluationReport, RegressionResult } from "./types.js";

export class RegressionGuard {
  constructor(private readonly minimumAccuracy = 0) {}

  compare(baseline: EvaluationReport, candidate: EvaluationReport): RegressionResult {
    const baselineFailures = new Set(
      baseline.caseEvaluations.filter((evaluation) => !evaluation.passed).map((evaluation) => evaluation.caseId)
    );

    const regressions: CaseEvaluation[] = candidate.caseEvaluations.filter(
      (evaluation) => !evaluation.passed && !baselineFailures.has(evaluation.caseId)
    );

    return {
      passed: candidate.accuracy >= baseline.accuracy && candidate.accuracy >= this.minimumAccuracy && regressions.length === 0,
      baselineAccuracy: baseline.accuracy,
      candidateAccuracy: candidate.accuracy,
      minimumAccuracy: this.minimumAccuracy,
      regressions
    };
  }
}
