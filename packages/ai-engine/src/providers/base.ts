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

  // Default classification strategy: prompt the model, parse the label list.
  async classify(text: string, candidateLabels: string[]): Promise<ClassificationResult> {
    const response = await this.complete({
      messages: [
        {
          role: "system",
          content:
            "Classify the email into zero or more of the allowed labels. " +
            "Reply with a JSON array of labels only. Allowed labels: " +
            candidateLabels.join(", "),
        },
        { role: "user", content: text },
      ],
    });

    try {
      const parsed = JSON.parse(response.text) as unknown;
      const labels = Array.isArray(parsed)
        ? parsed.filter((l): l is string => typeof l === "string")
        : [];
      return { labels: labels.filter((l) => candidateLabels.includes(l)) };
    } catch {
      return { labels: [] };
    }
  }
}
