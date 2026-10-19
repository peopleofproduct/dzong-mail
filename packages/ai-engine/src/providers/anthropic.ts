import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";
import { BaseProvider } from "./base";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

// Scaffold: shape is implemented, real API handshake intentionally deferred.
export class AnthropicProvider extends BaseProvider {
  readonly type = "ANTHROPIC" as const;

  complete(_request: CompletionRequest): Promise<CompletionResponse> {
    throw new Error("AnthropicProvider handshake not yet implemented — scaffold only");
  }

  embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("AnthropicProvider handshake not yet implemented — scaffold only");
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(Boolean(this.config.apiKey));
  }
}
