import "server-only";

/**
 * Provider-agnostic boundary for AI calls. Nothing outside this file and
 * its concrete implementation (openaiProvider.ts) knows which AI vendor
 * is in use, or holds an API key. Prompt construction, schema validation,
 * and persistence all live elsewhere and never talk to a provider SDK
 * directly.
 */
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  /** Server-owned label for logs only — never persisted verbatim as a secret. */
  purpose: string;
}

export interface AiCompletionResult {
  /** Raw text from the provider — NOT yet validated. Callers must parse/validate before trusting it. */
  rawText: string;
  model: string;
  durationMs: number;
  /** Only present if the provider reports it; never fabricated. */
  totalTokens: number | null;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_configured" | "timeout" | "provider_error",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
