import type { AgentSpec, Task, ToolDefinition } from "./types.js";

export interface AgentSpecParseResult {
  ok: boolean;
  agentSpec?: AgentSpec;
  errors: string[];
}

type JsonRecord = Record<string, unknown>;

const requiredStringFields = [
  "id",
  "name",
  "role",
  "systemInstructions",
  "taskInstructions",
  "outputFormat",
  "verificationInstructions"
] as const;

export function parseAgentSpecFromModelOutput(modelOutput: string, task: Task): AgentSpecParseResult {
  const jsonText = extractJsonObject(modelOutput);
  if (!jsonText) {
    return { ok: false, errors: ["Model output did not contain a JSON object."] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      ok: false,
      errors: [`Model output was not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  return validateAgentSpec(parsed, task);
}

export function validateAgentSpec(value: unknown, task: Task): AgentSpecParseResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["AgentSpec must be a JSON object."] };
  }

  const errors: string[] = [];
  for (const field of requiredStringFields) {
    if (!isNonEmptyString(value[field])) {
      errors.push(`Missing or invalid required field: ${field}.`);
    }
  }

  if (value.version !== undefined && (!Number.isInteger(value.version) || Number(value.version) < 1)) {
    errors.push("Field version must be a positive integer when provided.");
  }

  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0 || !value.capabilities.every(isNonEmptyString)) {
    errors.push("Field capabilities must be a non-empty string array.");
  }

  if (value.tools !== undefined && !isToolDefinitionArray(value.tools)) {
    errors.push("Field tools must be an array of tool definitions when provided.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const systemInstructions = String(value.systemInstructions);
  const taskInstructions = String(value.taskInstructions);

  return {
    ok: true,
    errors: [],
    agentSpec: {
      id: String(value.id),
      name: String(value.name),
      version: Number.isInteger(value.version) ? Number(value.version) : 1,
      role: String(value.role),
      systemInstructions,
      taskInstructions,
      outputFormat: String(value.outputFormat),
      verificationInstructions: String(value.verificationInstructions),
      instructions: isNonEmptyString(value.instructions)
        ? String(value.instructions)
        : `${systemInstructions} ${taskInstructions}`,
      capabilities: value.capabilities as string[],
      tools: value.tools as ToolDefinition[] | undefined,
      metadata: {
        ...(isRecord(value.metadata) ? value.metadata : {}),
        designer: "llm",
        sourceTask: task.description
      }
    }
  };
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isToolDefinitionArray(value: unknown): value is ToolDefinition[] {
  return (
    Array.isArray(value) &&
    value.every(
      (tool) =>
        isRecord(tool) &&
        isNonEmptyString(tool.name) &&
        isNonEmptyString(tool.description) &&
        (tool.inputSchema === undefined || isRecord(tool.inputSchema))
    )
  );
}
