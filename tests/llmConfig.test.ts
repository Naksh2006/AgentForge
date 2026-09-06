import assert from "node:assert/strict";
import test from "node:test";
import { createLlmProviderFromEnv, readLlmConfigFromEnv } from "../src/llmProvider.js";

test("reports missing LLM configuration without exposing a secret", () => {
  const status = readLlmConfigFromEnv({});

  assert.equal(status.configured, false);
  assert.equal(status.model, "gpt-4o-mini");
  assert.equal(status.apiKeySource, undefined);
  assert.deepEqual(status.missing, ["AGENTFORGE_LLM_API_KEY or OPENAI_API_KEY"]);
  assert.equal(createLlmProviderFromEnv({}), undefined);
});

test("reports configured LLM settings using AGENTFORGE_LLM_API_KEY without returning the secret", () => {
  const status = readLlmConfigFromEnv({
    AGENTFORGE_LLM_API_KEY: "secret-value",
    AGENTFORGE_LLM_MODEL: "test-model",
    AGENTFORGE_LLM_BASE_URL: "https://example.test/v1"
  });

  assert.equal(status.configured, true);
  assert.equal(status.model, "test-model");
  assert.equal(status.baseUrl, "https://example.test/v1");
  assert.equal(status.apiKeySource, "AGENTFORGE_LLM_API_KEY");
  assert.deepEqual(status.missing, []);
  assert.equal(JSON.stringify(status).includes("secret-value"), false);
  assert.ok(createLlmProviderFromEnv({ AGENTFORGE_LLM_API_KEY: "secret-value" }));
});

test("falls back to OPENAI_API_KEY and default model", () => {
  const status = readLlmConfigFromEnv({
    OPENAI_API_KEY: "secret-value"
  });

  assert.equal(status.configured, true);
  assert.equal(status.model, "gpt-4o-mini");
  assert.equal(status.apiKeySource, "OPENAI_API_KEY");
  assert.equal(JSON.stringify(status).includes("secret-value"), false);
});
