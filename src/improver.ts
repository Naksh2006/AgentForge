import type { AgentImprover, AgentSpec, FailureAnalysis, ImprovementProposal } from "./types.js";

export class InstructionAppendingImprover implements AgentImprover {
  async proposeImprovement(agentSpec: AgentSpec, analysis: FailureAnalysis): Promise<ImprovementProposal> {
    const missingTerms = Array.from(
      new Set(analysis.failedCases.flatMap((failure) => failure.missingRequiredTerms))
    );

    const improvementNote =
      missingTerms.length === 0
        ? "Maintain current behavior; no benchmark failures were detected."
        : `When relevant, explicitly address: ${missingTerms.join(", ")}.`;

    return {
      baseAgentSpecId: agentSpec.id,
      proposedAgentSpec: {
        ...agentSpec,
        id: `${agentSpec.id}-proposal-v${agentSpec.version + 1}`,
        version: agentSpec.version + 1,
        instructions: `${agentSpec.instructions} ${improvementNote}`,
        metadata: {
          ...agentSpec.metadata,
          improvementSource: "rule-based-failure-analysis"
        }
      },
      rationale:
        missingTerms.length === 0
          ? ["No failures were found, so no targeted instruction changes are required."]
          : [`Added guidance for missing benchmark expectations: ${missingTerms.join(", ")}.`]
    };
  }
}
