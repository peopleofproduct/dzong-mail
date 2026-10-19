import type {
  AIProviderConfig,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";
import { BaseProvider } from "./base";

export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_MODEL = "llama3.1";

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaProvider extends BaseProvider {
  readonly type = "OLLAMA" as const;
  private readonly baseUrl: string;

  constructor(config: AIProviderConfig) {
    super(config);
    this.baseUrl = (config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model ?? this.config.model ?? OLLAMA_DEFAULT_MODEL;
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? this.config.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as OllamaChatResponse;
    return {
      text: data.message.content,
      model: data.model,
      provider: this.type,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }

  async stream(
    request: CompletionRequest,
    onToken: (token: string) => void,
  ): Promise<CompletionResponse> {
    const model = request.model ?? this.config.model ?? OLLAMA_DEFAULT_MODEL;
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: request.messages,
        stream: true,
        options: {
          temperature: request.temperature ?? this.config.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
    }
    // Ollama streams newline-delimited JSON objects.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let usage = { promptTokens: 0, completionTokens: 0 };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          const piece = chunk.message?.content ?? "";
          if (piece) {
            text += piece;
            onToken(piece);
          }
          if (chunk.done) {
            usage = {
              promptTokens: chunk.prompt_eval_count ?? 0,
              completionTokens: chunk.eval_count ?? 0,
            };
          }
        } catch {
          // partial JSON across chunk boundaries - carried by buf
        }
      }
    }
    return { text, model, provider: this.type, usage };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model =
      request.model ?? this.config.embeddingModel ?? this.config.model ?? OLLAMA_DEFAULT_MODEL;
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: request.input }),
    });

    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as OllamaEmbedResponse;
    return { embeddings: data.embeddings, model };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }
}
