import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";
import { BaseProvider } from "./base";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
export const OPENAI_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

interface OpenAIChatResponse {
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAIEmbedResponse {
  data: { embedding: number[] }[];
}

export class OpenAIProvider extends BaseProvider {
  readonly type = "OPENAI" as const;
  private readonly baseUrl: string;

  constructor(config: ConstructorParameters<typeof BaseProvider>[0]) {
    super(config);
    this.baseUrl = (config.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    if (!this.config.apiKey) throw new Error("OpenAI API key is required");
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.config.model ?? OPENAI_DEFAULT_MODEL;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });
    if (!res.ok)
      throw new Error(`OpenAI /chat/completions failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as OpenAIChatResponse;
    return {
      text: data.choices[0]?.message.content ?? "",
      model: data.model,
      provider: this.type,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.config.embeddingModel ?? OPENAI_DEFAULT_EMBEDDING_MODEL;
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model, input: request.input }),
    });
    if (!res.ok) throw new Error(`OpenAI /embeddings failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as OpenAIEmbedResponse;
    return { embeddings: data.data.map((d) => d.embedding), model };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models?limit=1`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
