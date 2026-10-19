import type { AIProvider } from "./providers/base";
import { AnthropicProvider } from "./providers/anthropic";
import { OllamaProvider, OLLAMA_DEFAULT_BASE_URL } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import type { AIProviderConfig } from "./types";

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case "OLLAMA":
      return new OllamaProvider(config);
    case "OPENAI":
      return new OpenAIProvider(config);
    case "ANTHROPIC":
      return new AnthropicProvider(config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported AI provider: ${String(exhaustive)}`);
    }
  }
}

// Local-first default: when no settings row exists yet, fall back to Ollama on localhost.
export function resolveProvider(settings: AIProviderConfig | null | undefined): AIProvider {
  return createAIProvider(settings ?? { provider: "OLLAMA", baseUrl: OLLAMA_DEFAULT_BASE_URL });
}
