import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentSpecFromModelOutput } from "../src/agentSpecParser.js";
import { LlmAgentDesigner } from "../src/llmAgentDesigner.js";
import type { LlmProvider, LlmRequest } from "../src/llmProvider.js";
import type { Task } from "../src/types.js";

const task: Task = {
  id: "support-agent",
  description: "Design a support agent for refund and billing requests."
};

test("parses and validates a valid LLM-generated AgentSpec", () => {
  const result = parseAgentSpecFromModelOutput(
    JSON.stringify({
      id: "support-agent-v1",
      name: "Support Agent",
      version: 1,
      role: "Customer support specialist",
      systemInstructions: "Be accurate, concise, and polite.",
      taskInstructions: "Resolve refund and billing requests.",
      outputFormat: "Short customer-facing answer with next steps.",
      verificationInstructions: "Check policy detail and escalation needs before answering.",
      capabilities: ["refunds", "billing"],
      tools: [
        {
          name: "lookupOrder",
          description: "Looks up order metadata.",
          inputSchema: { type: "object" }
        }
      ]
    }),
    task
  );

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.agentSpec?.role, "Customer support specialist");
  assert.equal(result.agentSpec?.tools?.[0]?.name, "lookupOrder");
  assert.equal(result.agentSpec?.metadata?.designer, "llm");
});

test("reports malformed model output without throwing", () => {
  const result = parseAgentSpecFromModelOutput("not-json", task);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /JSON object/);
});

test("reports missing required AgentSpec fields", () => {
  const result = parseAgentSpecFromModelOutput(
    JSON.stringify({
      id: "support-agent-v1",
      name: "Support Agent",
      version: 1,
      role: "Customer support specialist",
      capabilities: ["refunds"]
    }),
    task
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /systemInstructions/);
  assert.match(result.errors.join("\n"), /taskInstructions/);
  assert.match(result.errors.join("\n"), /outputFormat/);
  assert.match(result.errors.join("\n"), /verificationInstructions/);
});

test("LLM-backed designer falls back when model output is malformed", async () => {
  const designer = new LlmAgentDesigner(new StaticLlmProvider("not-json"));

  const spec = await designer.design(task);

  assert.equal(spec.name, "Customer Support Triage Agent");
  assert.equal(spec.metadata?.designer, "llm-fallback");
  assert.ok(Array.isArray(spec.metadata?.llmDesignerErrors));
});

test("LLM-backed designer falls back when provider fails", async () => {
  const designer = new LlmAgentDesigner(new FailingLlmProvider());

  const spec = await designer.design(task);

  assert.equal(spec.name, "Customer Support Triage Agent");
  assert.equal(spec.metadata?.designer, "llm-fallback");
  assert.match(String((spec.metadata?.llmDesignerErrors as string[])[0]), /provider unavailable/);
});

class StaticLlmProvider implements LlmProvider {
  constructor(private readonly output: string) {}

  async generateText(_request: LlmRequest): Promise<string> {
    return this.output;
  }
}

class FailingLlmProvider implements LlmProvider {
  async generateText(_request: LlmRequest): Promise<string> {
    throw new Error("provider unavailable");
  }
}
