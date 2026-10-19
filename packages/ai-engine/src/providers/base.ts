import type {
  AIProviderConfig,
  AIProviderType,
  ClassificationResult,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "../types";

export interface AIProvider {
  readonly type: AIProviderType;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream?(
    request: CompletionRequest,
    onToken: (token: string) => void,
  ): Promise<CompletionResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  classify(text: string, candidateLabels: string[]): Promise<ClassificationResult>;
  healthCheck(): Promise<boolean>;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly type: AIProviderType;

  constructor(protected readonly config: AIProviderConfig) {}

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  abstract healthCheck(): Promise<boolean>;

  /**
   * Streaming completion. Providers override with a real token stream;
   * the default emits the whole response at once so every provider works.
   */
  async stream(
    request: CompletionRequest,
    onToken: (token: string) => void,
  ): Promise<CompletionResponse> {
    const res = await this.complete(request);
    onToken(res.text);
    return res;
  }

  // Default classification strategy: prompt the model, parse the label list.
  async classify(text: string, candidateLabels: string[]): Promise<ClassificationResult> {
    const response = await this.complete({
      messages: [
        {
          role: "system",
          content:
            "Classify the email into zero or more of the allowed labels. " +
            'Reply with a JSON object {"labels": [...], "confidence": 0-1, "reason": "one line"}. ' +
            "A bare JSON array of labels is also acceptable. Allowed labels: " +
            candidateLabels.join(", "),
        },
        { role: "user", content: text },
      ],
    });

    try {
      const parsed = JSON.parse(response.text) as unknown;
      // Accept both the object form and the legacy bare-array form.
      const raw = Array.isArray(parsed) ? parsed : (parsed as { labels?: unknown })?.labels;
      const labels = (Array.isArray(raw) ? raw : []).filter(
        (l): l is string => typeof l === "string",
      );
      const obj = Array.isArray(parsed) ? undefined : (parsed as Record<string, unknown>);
      const confidence =
        typeof obj?.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : undefined;
      const reason = typeof obj?.reason === "string" ? obj.reason.slice(0, 300) : undefined;
      return {
        labels: labels.filter((l) => candidateLabels.includes(l)),
        confidence,
        reason,
      };
    } catch {
      return { labels: [] };
    }
  }
}
