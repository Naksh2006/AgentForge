export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: "text" | "json";
}

export interface LlmProvider {
  generateText(request: LlmRequest): Promise<string>;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LlmEnvironmentConfigStatus {
  configured: boolean;
  model: string;
  baseUrl?: string;
  apiKeySource?: "AGENTFORGE_LLM_API_KEY" | "OPENAI_API_KEY";
  missing: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleLlmProvider implements LlmProvider {
  private readonly baseUrl: string;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async generateText(request: LlmRequest): Promise<string> {
    const abortController = new AbortController();
    const timeout = request.timeoutMs
      ? setTimeout(() => abortController.abort(new Error(`LLM provider timed out after ${request.timeoutMs}ms`)), request.timeoutMs)
      : undefined;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: abortController.signal,
        body: JSON.stringify({
          model: this.config.model,
          ...buildTemperatureParam(this.config.model, request.temperature),
          ...(request.responseFormat !== "text" ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM provider request failed with ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM provider response did not include message content.");
      }

      return content;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

export function createLlmProviderFromEnv(env: NodeJS.ProcessEnv = process.env): LlmProvider | undefined {
  const configStatus = readLlmConfigFromEnv(env);
  const apiKey = getConfiguredApiKey(env);
  if (!apiKey) {
    return undefined;
  }

  return new OpenAICompatibleLlmProvider({
    apiKey,
    model: configStatus.model,
    baseUrl: configStatus.baseUrl
  });
}

export function readLlmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmEnvironmentConfigStatus {
  const apiKeySource = getConfiguredApiKeySource(env);
  const model = env.AGENTFORGE_LLM_MODEL?.trim() || "gpt-4o-mini";
  const baseUrl = env.AGENTFORGE_LLM_BASE_URL?.trim() || undefined;

  return {
    configured: Boolean(apiKeySource),
    model,
    baseUrl,
    apiKeySource,
    missing: apiKeySource ? [] : ["AGENTFORGE_LLM_API_KEY or OPENAI_API_KEY"]
  };
}

function getConfiguredApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const source = getConfiguredApiKeySource(env);
  return source ? env[source] : undefined;
}

function getConfiguredApiKeySource(env: NodeJS.ProcessEnv): "AGENTFORGE_LLM_API_KEY" | "OPENAI_API_KEY" | undefined {
  if (env.AGENTFORGE_LLM_API_KEY?.trim()) {
    return "AGENTFORGE_LLM_API_KEY";
  }

  if (env.OPENAI_API_KEY?.trim()) {
    return "OPENAI_API_KEY";
  }

  return undefined;
}

function buildTemperatureParam(model: string, temperature: number | undefined): { temperature?: number } {
  const requestedTemperature = temperature ?? 0.2;
  if (model.startsWith("gpt-5") && requestedTemperature !== 1) {
    return {};
  }

  return { temperature: requestedTemperature };
}
