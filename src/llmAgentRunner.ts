import type { LlmProvider } from "./llmProvider.js";
import type { AgentRun, AgentRunner, AgentSpec, BenchmarkCase, ToolDefinition } from "./types.js";

export interface LlmAgentRunnerOptions {
  timeoutMs?: number;
  temperature?: number;
}

interface ParsedRunnerResponse {
  ok: boolean;
  output?: string;
  error?: string;
}

export class LlmAgentRunner implements AgentRunner {
  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly options: LlmAgentRunnerOptions = {}
  ) {}

  async run(agentSpec: AgentSpec, benchmarkCase: BenchmarkCase): Promise<AgentRun> {
    try {
      const response = await this.llmProvider.generateText({
        systemPrompt: buildSystemPrompt(agentSpec),
        userPrompt: buildUserPrompt(agentSpec, benchmarkCase),
        temperature: this.options.temperature ?? 0.2,
        timeoutMs: this.options.timeoutMs,
        responseFormat: "json"
      });

      const parsed = parseRunnerResponse(response);
      if (!parsed.ok || !parsed.output) {
        return failedRun(agentSpec, benchmarkCase, parsed.error ?? "LLM runner response was malformed.");
      }

      return {
        caseId: benchmarkCase.id,
        input: benchmarkCase.input,
        output: parsed.output,
        agentSpecId: agentSpec.id,
        status: "success",
        metadata: {
          runner: "llm"
        }
      };
    } catch (error) {
      return failedRun(agentSpec, benchmarkCase, error instanceof Error ? error.message : String(error));
    }
  }
}

export function buildSystemPrompt(agentSpec: AgentSpec): string {
  const toolsSection = formatTools(agentSpec.tools ?? []);

  return [
    `Role: ${agentSpec.role}`,
    "",
    "System instructions:",
    agentSpec.systemInstructions,
    "",
    "Task instructions:",
    agentSpec.taskInstructions,
    "",
    "Output format:",
    agentSpec.outputFormat,
    "",
    "Verification instructions:",
    agentSpec.verificationInstructions,
    "",
    "Available tools:",
    toolsSection,
    "",
    "Return only valid JSON with this shape:",
    '{ "output": "final response to the user" }'
  ].join("\n");
}

export function buildUserPrompt(agentSpec: AgentSpec, benchmarkCase: BenchmarkCase): string {
  return [
    `Agent name: ${agentSpec.name}`,
    `Agent version: ${agentSpec.version}`,
    `Benchmark case id: ${benchmarkCase.id}`,
    "",
    "Customer request:",
    benchmarkCase.input,
    "",
    "Generate the agent's response for this single benchmark case."
  ].join("\n");
}

function parseRunnerResponse(response: string): ParsedRunnerResponse {
  if (response.trim().length === 0) {
    return { ok: false, error: "LLM runner returned an empty response." };
  }

  const jsonText = extractJsonObject(response);
  if (!jsonText) {
    return { ok: false, error: "LLM runner response did not contain a JSON object." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      ok: false,
      error: `LLM runner response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!isRecord(parsed) || typeof parsed.output !== "string" || parsed.output.trim().length === 0) {
    return { ok: false, error: "LLM runner JSON must include a non-empty string output field." };
  }

  return { ok: true, output: parsed.output.trim() };
}

function failedRun(agentSpec: AgentSpec, benchmarkCase: BenchmarkCase, error: string): AgentRun {
  return {
    caseId: benchmarkCase.id,
    input: benchmarkCase.input,
    output: "",
    agentSpecId: agentSpec.id,
    status: "error",
    error,
    metadata: {
      runner: "llm"
    }
  };
}

function formatTools(tools: ToolDefinition[]): string {
  if (tools.length === 0) {
    return "No tools are available. Do not claim to call external tools.";
  }

  return tools
    .map((tool) =>
      [
        `- ${tool.name}: ${tool.description}`,
        tool.inputSchema ? `  inputSchema: ${JSON.stringify(tool.inputSchema)}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
}

function extractJsonObject(text: string): string | undefined {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1] ?? text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return undefined;
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
