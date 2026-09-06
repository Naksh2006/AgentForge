import { BasicAgentDesigner } from "./agentDesigner.js";
import { parseAgentSpecFromModelOutput } from "./agentSpecParser.js";
import type { LlmProvider } from "./llmProvider.js";
import type { AgentDesigner, AgentSpec, Task } from "./types.js";

export class LlmAgentDesigner implements AgentDesigner {
  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly fallbackDesigner: AgentDesigner = new BasicAgentDesigner()
  ) {}

  async design(task: Task): Promise<AgentSpec> {
    try {
      const modelOutput = await this.llmProvider.generateText({
        temperature: 0.2,
        systemPrompt: [
          "You design software agent specifications.",
          "Return only a valid JSON object.",
          "Do not include prose outside the JSON object."
        ].join(" "),
        userPrompt: buildAgentSpecPrompt(task)
      });

      const parsed = parseAgentSpecFromModelOutput(modelOutput, task);
      if (parsed.ok && parsed.agentSpec) {
        return parsed.agentSpec;
      }

      return this.fallback(task, parsed.errors);
    } catch (error) {
      return this.fallback(task, [error instanceof Error ? error.message : String(error)]);
    }
  }

  private async fallback(task: Task, errors: string[]): Promise<AgentSpec> {
    const fallbackSpec = await this.fallbackDesigner.design(task);
    return {
      ...fallbackSpec,
      metadata: {
        ...fallbackSpec.metadata,
        designer: "llm-fallback",
        llmDesignerErrors: errors
      }
    };
  }
}

function buildAgentSpecPrompt(task: Task): string {
  return [
    `Task id: ${task.id}`,
    `Task description: ${task.description}`,
    "",
    "Create an AgentSpec JSON object with exactly these required fields:",
    "- id: stable kebab-case identifier",
    "- name: human-readable agent name",
    "- version: positive integer",
    "- role: concise description of the agent's role",
    "- systemInstructions: durable behavioral instructions",
    "- taskInstructions: task-specific operating instructions",
    "- outputFormat: expected shape and style of responses",
    "- verificationInstructions: checks the agent should perform before final output",
    "- capabilities: array of concise capability strings",
    "- tools: optional array of { name, description, inputSchema } objects",
    "",
    "The JSON must be directly parseable and must not include markdown."
  ].join("\n");
}
