import type { Benchmark, EvaluationReport, FailureAnalysis, FailureAnalyzer, FailureInsight } from "./types.js";

export class RuleBasedFailureAnalyzer implements FailureAnalyzer {
  analyze(benchmark: Benchmark, report: EvaluationReport): FailureAnalysis {
    const casesById = new Map(benchmark.cases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]));
    const failedCases: FailureInsight[] = report.caseEvaluations
      .filter((evaluation) => !evaluation.passed)
      .map((evaluation) => {
        const benchmarkCase = casesById.get(evaluation.caseId);
        const missing = evaluation.missingRequiredTerms;
        const forbidden = evaluation.forbiddenTermsFound;
        const reasonParts = [
          missing.length > 0 ? `missing required terms: ${missing.join(", ")}` : "",
          forbidden.length > 0 ? `included forbidden terms: ${forbidden.join(", ")}` : ""
        ].filter(Boolean);

        return {
          caseId: evaluation.caseId,
          tags: benchmarkCase?.tags ?? [],
          reason: reasonParts.join("; "),
          missingRequiredTerms: missing,
          forbiddenTermsFound: forbidden
        };
      });

    const failuresByTag = failedCases.reduce<Record<string, number>>((counts, failure) => {
      for (const tag of failure.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
      return counts;
    }, {});

    return {
      failedCases,
      failuresByTag,
      summary:
        failedCases.length === 0
          ? "No benchmark failures found."
          : `${failedCases.length} benchmark case(s) failed. Most affected tags: ${Object.entries(failuresByTag)
              .sort((a, b) => b[1] - a[1])
              .map(([tag, count]) => `${tag} (${count})`)
              .join(", ")}.`
    };
  }
}
