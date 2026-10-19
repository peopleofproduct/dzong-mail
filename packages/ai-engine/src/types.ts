export type AIProviderType = "OLLAMA" | "OPENAI" | "ANTHROPIC";

export interface AIProviderConfig {
  provider: AIProviderType;
  /** Endpoint override — e.g. http://localhost:11434 for Ollama. */
  baseUrl?: string;
  /** Cloud BYOK credential, decrypted by the caller before injection. */
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  temperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  text: string;
  model: string;
  provider: AIProviderType;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

export interface ClassificationResult {
  labels: string[];
  confidence?: number;
  /** One-line rationale, when the provider supplied one. */
  reason?: string;
}
