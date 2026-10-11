import * as z from "zod";

export const PronunciationAttemptIdSchema = z.string().uuid("Invalid pronunciation attempt.");

/** Server-generated target phrase — never trusted from the client. */
export const TargetPhraseResponseSchema = z.object({
  text: z.string().trim().min(1).max(200),
});
export type TargetPhraseResponse = z.infer<typeof TargetPhraseResponseSchema>;

/**
 * EVIDENCE HONESTY, structural not just prompted. Real recorded audio is
 * transcribed by whisper-1 (speech-to-text) and the resulting TEXT is
 * compared against the target phrase by a text LLM — that is genuine
 * evidence (what was recognized, whether it matches the target), but it
 * is NOT acoustic or phoneme-level pronunciation measurement. Neither
 * provider this codebase calls can tell you how a sound was actually
 * articulated, how accurate stress/rhythm/intonation were, how native an
 * accent sounded, or a numeric "pronunciation accuracy." See
 * AGENTS.md's "Pronunciation / Mary" section for the full reasoning.
 *
 * This fixed disclaimer is a SERVER-OWNED CONSTANT, deliberately not a
 * model-generated field — src/lib/pronunciation/evaluate.ts appends it to
 * every persisted evaluation itself, so the limitation is guaranteed
 * present and worded correctly regardless of what the model does, never
 * dependent on the model choosing to self-report it honestly.
 */
export const PRONUNCIATION_EVALUATION_LIMITATIONS =
  "This feedback is based on automatic speech recognition (a text transcript of your recording) compared against the target phrase as text. It is NOT acoustic or phoneme-level pronunciation analysis — it cannot assess actual sound articulation, stress, rhythm, intonation, accent quality, or native-likeness, and it does not produce a numeric pronunciation accuracy score.";

/**
 * The part of the evaluation the MODEL actually produces. Field names are
 * chosen to describe exactly what transcript-based evidence can prove —
 * never to imply more:
 * - `recognitionQuality` (not "intelligibility"): intelligibility implies
 *   a human-perceived judgment of how understandable the SPEECH was;
 *   what we actually have is how well the ASR system recognized it as
 *   words, which can diverge from true intelligibility in either
 *   direction (a strong accent can confuse ASR even when a human would
 *   understand fine; language-model priors can let ASR "recognize"
 *   mumbled speech a human wouldn't easily parse).
 * - `contentMatch`: whether the recognized words match the target
 *   phrase's words/meaning — language correctness, not sound quality.
 *   Kept separate from `recognitionQuality` on purpose: "clear but wrong
 *   phrase" and "hard to recognize but right words" are different,
 *   genuinely distinguishable findings from a transcript comparison.
 * - `differences`: concrete, literal differences between the target text
 *   and the recognized transcript (a word missing, substituted, or
 *   added) — never an acoustic/sound-level claim. See
 *   EVALUATION_HONESTY_INSTRUCTIONS in prompt.ts for the explicit list of
 *   forbidden claim types (specific sounds, stress, rhythm, intonation,
 *   accent, numeric accuracy).
 * - `practiceSuggestion`: a GENERIC, actionable practice tip (e.g. "try
 *   saying it more slowly and clearly"), explicitly never a claim about
 *   what the learner actually did acoustically.
 */
export const PronunciationModelOutputSchema = z.object({
  recognitionQuality: z.enum(["clear", "mostly_clear", "hard_to_understand", "no_speech_detected"]),
  contentMatch: z.enum(["close_match", "partial_match", "different", "unknown"]),
  differences: z.array(z.string().trim().min(1).max(200)).max(5),
  practiceSuggestion: z.string().trim().min(1).max(300),
});
export type PronunciationModelOutput = z.infer<typeof PronunciationModelOutputSchema>;

/**
 * The full, persisted evaluation shape — the model's output plus two
 * server-set fields never produced by the model:
 * - `recognizedTranscript`: echoes the real transcript this evaluation
 *   was actually computed from, directly into the structured result, so
 *   `pronunciation_attempts.evaluation` is self-contained and auditable
 *   against its own evidence without cross-referencing another column.
 *   Always set from the same value as `pronunciation_attempts.transcript`
 *   — never independently model-generated, never editable.
 * - `limitations`: always exactly PRONUNCIATION_EVALUATION_LIMITATIONS —
 *   see that constant's comment for why this is structural, not prompted.
 */
export const PronunciationEvaluationSchema = PronunciationModelOutputSchema.extend({
  recognizedTranscript: z.string(),
  limitations: z.string(),
});
export type PronunciationEvaluation = z.infer<typeof PronunciationEvaluationSchema>;

export const AUDIO_ACCEPTED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/mp4a-latm",
] as const;

/** ~10MB — generous for a short (a few seconds to ~30s) spoken phrase at any common compressed bitrate, small enough to reject accidental/abusive uploads. */
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
