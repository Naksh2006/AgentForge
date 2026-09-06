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
          temperature: request.temperature ?? 0.2,
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
  const apiKey = env.AGENTFORGE_LLM_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return new OpenAICompatibleLlmProvider({
    apiKey,
    model: env.AGENTFORGE_LLM_MODEL ?? "gpt-4o-mini",
    baseUrl: env.AGENTFORGE_LLM_BASE_URL
  });
}
