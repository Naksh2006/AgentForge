import type { AgentDesigner, AgentSpec, Task } from "./types.js";

export class BasicAgentDesigner implements AgentDesigner {
  async design(task: Task): Promise<AgentSpec> {
    const systemInstructions = [
      "Answer customer support requests clearly and concisely.",
      "Acknowledge the issue, provide the next best action, and include relevant policy details.",
      "Escalate billing disputes, security incidents, and enterprise account issues when needed."
    ].join(" ");
    const taskInstructions = "Handle common customer support requests accurately and politely.";

    return {
      id: `${task.id}-agent-v1`,
      name: "Customer Support Triage Agent",
      version: 1,
      role: "Customer support triage specialist",
      systemInstructions,
      taskInstructions,
      outputFormat: "Plain-language response with acknowledgement, policy detail, and next action.",
      verificationInstructions:
        "Before responding, verify that the answer is polite, specific to the issue, and includes required escalation or policy details.",
      instructions: `${systemInstructions} ${taskInstructions}`,
      capabilities: ["support-triage", "policy-response", "basic-escalation"],
      tools: [],
      metadata: {
        designer: "basic",
        sourceTask: task.description
      }
    };
  }
}
