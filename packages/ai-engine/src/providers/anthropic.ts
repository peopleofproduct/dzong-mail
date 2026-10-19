import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";
import { BaseProvider } from "./base";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicMessagesResponse {
  model: string;
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider extends BaseProvider {
  readonly type = "ANTHROPIC" as const;
  private readonly baseUrl: string;

  constructor(config: ConstructorParameters<typeof BaseProvider>[0]) {
    super(config);
    this.baseUrl = (config.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    if (!this.config.apiKey) throw new Error("Anthropic API key is required");
    return {
      "x-api-key": this.config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.config.model ?? ANTHROPIC_DEFAULT_MODEL;
    // Anthropic takes system prompts as a top-level field, not a message.
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages: AnthropicMessage[] = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        messages,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic /messages failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as AnthropicMessagesResponse;
    return {
      text: data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(""),
      model: data.model,
      provider: this.type,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }

  // Anthropic has no embeddings API — callers should pair this provider with
  // Ollama/OpenAI for embeddings (AISettings.embeddingModel + embedding base).
  embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return Promise.reject(
      new Error("Anthropic has no embeddings endpoint — configure Ollama or OpenAI for embed"),
    );
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/v1/models?limit=1`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
