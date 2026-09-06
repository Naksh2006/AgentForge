import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerSupportBenchmark } from "../src/benchmark.js";
import { KeywordEvaluator } from "../src/evaluator.js";
import { buildSystemPrompt, LlmAgentRunner } from "../src/llmAgentRunner.js";
import type { LlmProvider, LlmRequest } from "../src/llmProvider.js";
import type { AgentSpec } from "../src/types.js";

const agentSpec: AgentSpec = {
  id: "support-agent-v1",
  name: "Support Agent",
  version: 1,
  role: "Customer support specialist",
  systemInstructions: "Be accurate, polite, and policy-aware.",
  taskInstructions: "Handle refund, billing, account, and shipping requests.",
  outputFormat: "Short customer-facing response with next steps.",
  verificationInstructions: "Check that the answer includes required policy detail before responding.",
  instructions: "Be accurate, polite, and policy-aware. Handle refund, billing, account, and shipping requests.",
  capabilities: ["refunds", "billing", "shipping"],
  tools: [
    {
      name: "lookupOrder",
      description: "Looks up order details.",
      inputSchema: { type: "object", properties: { orderNumber: { type: "string" } } }
    }
  ]
};

test("builds an LLM execution request from AgentSpec fields", async () => {
  const provider = new CapturingLlmProvider(
    JSON.stringify({
      output: "Refunds are available within 30 days. Please provide your order number."
    })
  );
  const runner = new LlmAgentRunner(provider, { timeoutMs: 1234, temperature: 0.1 });
  const benchmarkCase = createCustomerSupportBenchmark().cases[0]!;

  const run = await runner.run(agentSpec, benchmarkCase);

  assert.equal(run.status, "success");
  assert.equal(run.output, "Refunds are available within 30 days. Please provide your order number.");
  assert.equal(provider.lastRequest?.temperature, 0.1);
  assert.equal(provider.lastRequest?.timeoutMs, 1234);
  assert.equal(provider.lastRequest?.responseFormat, "json");
  assert.match(provider.lastRequest?.systemPrompt ?? "", /Customer support specialist/);
  assert.match(provider.lastRequest?.systemPrompt ?? "", /Be accurate, polite, and policy-aware/);
  assert.match(provider.lastRequest?.systemPrompt ?? "", /Handle refund, billing, account, and shipping requests/);
  assert.match(provider.lastRequest?.systemPrompt ?? "", /Short customer-facing response/);
  assert.match(provider.lastRequest?.systemPrompt ?? "", /required policy detail/);
  assert.match(provider.lastRequest?.systemPrompt ?? "", /lookupOrder/);
  assert.match(provider.lastRequest?.userPrompt ?? "", /refund-window/);
});

test("handles malformed LLM runner output without throwing", async () => {
  const runner = new LlmAgentRunner(new CapturingLlmProvider("not-json"));

  const run = await runner.run(agentSpec, createCustomerSupportBenchmark().cases[0]!);

  assert.equal(run.status, "error");
  assert.equal(run.output, "");
  assert.match(run.error ?? "", /JSON object/);
});

test("handles empty LLM runner output without throwing", async () => {
  const runner = new LlmAgentRunner(new CapturingLlmProvider("   "));

  const run = await runner.run(agentSpec, createCustomerSupportBenchmark().cases[0]!);

  assert.equal(run.status, "error");
  assert.equal(run.output, "");
  assert.match(run.error ?? "", /empty response/);
});

test("handles provider errors without throwing", async () => {
  const runner = new LlmAgentRunner(new ThrowingLlmProvider(new Error("provider failed")));

  const run = await runner.run(agentSpec, createCustomerSupportBenchmark().cases[0]!);

  assert.equal(run.status, "error");
  assert.equal(run.output, "");
  assert.match(run.error ?? "", /provider failed/);
});

test("handles provider timeout errors without throwing", async () => {
  const runner = new LlmAgentRunner(new ThrowingLlmProvider(new Error("LLM provider timed out after 10ms")));

  const run = await runner.run(agentSpec, createCustomerSupportBenchmark().cases[0]!);

  assert.equal(run.status, "error");
  assert.match(run.error ?? "", /timed out/);
});

test("integrates AgentSpec to AgentRunner output to Evaluator", async () => {
  const benchmark = createCustomerSupportBenchmark();
  const benchmarkCase = benchmark.cases[0]!;
  const runner = new LlmAgentRunner(
    new CapturingLlmProvider(
      JSON.stringify({
        output: "Refund requests are available within 30 days. Please share your order number."
      })
    )
  );

  const run = await runner.run(agentSpec, benchmarkCase);
  const report = new KeywordEvaluator().evaluate(agentSpec, { ...benchmark, cases: [benchmarkCase] }, [run]);

  assert.equal(run.status, "success");
  assert.equal(report.totalCases, 1);
  assert.equal(report.passedCases, 1);
  assert.equal(report.accuracy, 1);
});

test("documents system prompt shape for no-tool agents", () => {
  const prompt = buildSystemPrompt({ ...agentSpec, tools: [] });

  assert.match(prompt, /No tools are available/);
});

class CapturingLlmProvider implements LlmProvider {
  lastRequest?: LlmRequest;

  constructor(private readonly output: string) {}

  async generateText(request: LlmRequest): Promise<string> {
    this.lastRequest = request;
    return this.output;
  }
}

class ThrowingLlmProvider implements LlmProvider {
  constructor(private readonly error: Error) {}

  async generateText(_request: LlmRequest): Promise<string> {
    throw this.error;
  }
}
