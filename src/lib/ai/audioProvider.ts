import "server-only";

/**
 * Provider-agnostic boundary for AUDIO transcription — deliberately
 * separate from AiProvider (provider.ts), which only ever handles text.
 * Transcription evidence (what the learner's audio actually contained,
 * per the provider) and pronunciation ANALYSIS (src/lib/pronunciation/
 * evaluate.ts, which reasons over that transcript using the ordinary text
 * AiProvider) are kept conceptually and structurally distinct — see
 * AGENTS.md's "Pronunciation / Mary" section for why collapsing them
 * would risk implying acoustic/phoneme-level scoring this stack cannot
 * actually produce.
 */
export interface AudioTranscriptionRequest {
  /** A Web API File (what a Server Action receives from FormData) or Blob. */
  audio: Blob;
  /** Server-owned label for logs only — never persisted verbatim as a secret. */
  purpose: string;
}

export interface AudioTranscriptionResult {
  /** Raw transcript from the provider — real evidence, never fabricated or edited. */
  transcript: string;
  model: string;
  durationMs: number;
}

export class AudioProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_configured" | "timeout" | "unsupported_audio" | "provider_error",
  ) {
    super(message);
    this.name = "AudioProviderError";
  }
}

export interface AudioTranscriptionProvider {
  transcribe(request: AudioTranscriptionRequest): Promise<AudioTranscriptionResult>;
}
