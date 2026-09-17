import "server-only";

import OpenAI from "openai";
import { AiProviderError, type AiCompletionRequest, type AiCompletionResult, type AiProvider } from "./provider";

/**
 * The only file in this codebase that imports the OpenAI SDK or reads
 * OPENAI_API_KEY. The key never leaves this module, is never sent to the
 * browser, and is never logged. Model name is configurable via
 * OPENAI_MODEL so it isn't hardcoded.
 *
 * If the key isn't configured, this throws a typed AiProviderError
 * ("not_configured") rather than returning a fabricated response —
 * callers must surface an honest "AI service isn't available" error,
 * never invented lesson content.
 */
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MODEL = "gpt-4o-mini";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("OPENAI_API_KEY is not configured.", "not_configured");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }

  return cachedClient;
}

export const openaiProvider: AiProvider = {
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const client = getClient();
    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const startedAt = Date.now();

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: request.messages,
        response_format: { type: "json_object" },
      });

      const rawText = completion.choices[0]?.message?.content;
      if (!rawText) {
        throw new AiProviderError("Provider returned an empty response.", "provider_error");
      }

      return {
        rawText,
        model,
        durationMs: Date.now() - startedAt,
        totalTokens: completion.usage?.total_tokens ?? null,
      };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      // Never log the API key or the full request/prompt content here —
      // only enough to debug (purpose, model, duration, error name).
      console.error("[ai:openai] request failed", {
        purpose: request.purpose,
        model,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "unknown",
      });

      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new AiProviderError("AI provider request timed out.", "timeout");
      }

      throw new AiProviderError("AI provider request failed.", "provider_error");
    }
  },
};
