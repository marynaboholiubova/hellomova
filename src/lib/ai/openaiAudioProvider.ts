import "server-only";

import OpenAI from "openai";
import {
  AudioProviderError,
  type AudioTranscriptionRequest,
  type AudioTranscriptionResult,
  type AudioTranscriptionProvider,
} from "./audioProvider";

/**
 * The only file in this codebase that calls OpenAI's audio transcription
 * endpoint. Reuses the same OPENAI_API_KEY as openaiProvider.ts (one
 * provider account, two capabilities) but is its own module so the text
 * chat boundary and the audio boundary can never be confused — see
 * audioProvider.ts.
 *
 * Model is whisper-1: a real, general-purpose speech-to-text model. It
 * does NOT produce phoneme-level pronunciation scoring — only a text
 * transcript. Nothing in this file (or anything that calls it) may claim
 * otherwise; see src/lib/pronunciation/evaluate.ts for how that limit is
 * carried through to the learner-facing result.
 */
const REQUEST_TIMEOUT_MS = 30_000;
const TRANSCRIPTION_MODEL = "whisper-1";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AudioProviderError("OPENAI_API_KEY is not configured.", "not_configured");
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }

  return cachedClient;
}

export const openaiAudioProvider: AudioTranscriptionProvider = {
  async transcribe(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResult> {
    const client = getClient();
    const startedAt = Date.now();

    try {
      const result = await client.audio.transcriptions.create({
        file: request.audio,
        model: TRANSCRIPTION_MODEL,
      });

      const transcript = result.text?.trim();
      if (!transcript) {
        // A genuinely silent/empty recording is real evidence, not an
        // error — the caller (evaluate.ts) decides how to present "no
        // speech detected" honestly. Distinguish that from a provider
        // failure by returning an empty transcript rather than throwing.
        return { transcript: "", model: TRANSCRIPTION_MODEL, durationMs: Date.now() - startedAt };
      }

      return { transcript, model: TRANSCRIPTION_MODEL, durationMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof AudioProviderError) {
        throw error;
      }

      // Never log raw audio bytes or the API key — only enough to debug.
      console.error("[ai:openai-audio] transcription failed", {
        purpose: request.purpose,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "unknown",
      });

      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new AudioProviderError("Audio provider request timed out.", "timeout");
      }

      if (error instanceof OpenAI.BadRequestError) {
        throw new AudioProviderError("Audio format was not accepted by the provider.", "unsupported_audio");
      }

      throw new AudioProviderError("Audio provider request failed.", "provider_error");
    }
  },
};
