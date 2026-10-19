import type {
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";
import { BaseProvider } from "./base";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

// Scaffold: shape is implemented, real API handshake intentionally deferred.
export class OpenAIProvider extends BaseProvider {
  readonly type = "OPENAI" as const;

  complete(_request: CompletionRequest): Promise<CompletionResponse> {
    throw new Error("OpenAIProvider handshake not yet implemented — scaffold only");
  }

  embed(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error("OpenAIProvider handshake not yet implemented — scaffold only");
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(Boolean(this.config.apiKey));
  }
}
