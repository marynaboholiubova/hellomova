import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTranscribe = vi.fn();
vi.mock("@/lib/ai/openaiAudioProvider", () => ({
  openaiAudioProvider: { transcribe: mockTranscribe },
}));

const mockComplete = vi.fn();
vi.mock("@/lib/ai/openaiProvider", () => ({
  openaiProvider: { complete: mockComplete },
}));

const { transcribeAttemptAudio, evaluatePronunciationTranscript } = await import("./evaluate");
const { AudioProviderError } = await import("@/lib/ai/audioProvider");
const { AiProviderError } = await import("@/lib/ai/provider");
const { PRONUNCIATION_EVALUATION_LIMITATIONS } = await import("./schemas");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transcribeAttemptAudio — real evidence, honest failure", () => {
  it("returns the real transcript the provider produced", async () => {
    mockTranscribe.mockResolvedValue({ transcript: "Bonjour comment ça va", model: "whisper-1", durationMs: 500 });

    const result = await transcribeAttemptAudio(new Blob(["fake-audio-bytes"]));

    expect(result).toEqual({ success: true, transcript: "Bonjour comment ça va", model: "whisper-1" });
  });

  it("treats an empty transcript as real evidence (silence), not a thrown error", async () => {
    mockTranscribe.mockResolvedValue({ transcript: "", model: "whisper-1", durationMs: 200 });

    const result = await transcribeAttemptAudio(new Blob(["fake-audio-bytes"]));

    expect(result).toEqual({ success: true, transcript: "", model: "whisper-1" });
  });

  it("surfaces an honest 'unsupported format' message rather than crashing when the provider rejects the audio", async () => {
    mockTranscribe.mockRejectedValue(new AudioProviderError("bad format", "unsupported_audio"));

    const result = await transcribeAttemptAudio(new Blob(["fake-audio-bytes"]));

    expect(result).toEqual({ success: false, errorMessage: expect.stringContaining("format") });
  });

  it("surfaces an honest 'not configured' message when the provider has no API key", async () => {
    mockTranscribe.mockRejectedValue(new AudioProviderError("no key", "not_configured"));

    const result = await transcribeAttemptAudio(new Blob(["fake-audio-bytes"]));

    expect(result.success).toBe(false);
  });
});

describe("evaluatePronunciationTranscript — real Zod validation, never a fabricated score", () => {
  const validModelOutput = {
    recognitionQuality: "clear",
    contentMatch: "close_match",
    differences: [],
    practiceSuggestion: "Keep practicing at a natural pace.",
  };

  it("returns structured feedback when the provider responds with valid JSON matching the schema", async () => {
    mockComplete.mockResolvedValue({ rawText: JSON.stringify(validModelOutput), model: "gpt-4o-mini", durationMs: 10, totalTokens: 20 });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject(validModelOutput);
    }
  });

  it("a transcript that doesn't match the target can honestly produce content/recognition feedback with word-level differences — never an acoustic claim", async () => {
    const mismatchOutput = {
      recognitionQuality: "clear",
      contentMatch: "different",
      differences: ["The recognizer did not detect 'un'."],
      practiceSuggestion: "Try the phrase again slowly and clearly.",
    };
    mockComplete.mockResolvedValue({ rawText: JSON.stringify(mismatchOutput), model: "gpt-4o-mini", durationMs: 10, totalTokens: 20 });

    const result = await evaluatePronunciationTranscript({
      targetLanguageName: "French",
      targetText: "Je voudrais un café.",
      transcript: "Je voudrais café.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentMatch).toBe("different");
      expect(result.data.differences).toEqual(["The recognizer did not detect 'un'."]);
      // Evidence-based wording only — no claim about sounds/stress/accent.
      expect(result.data.differences.join(" ")).not.toMatch(/sound|stress|intonation|accent|vowel/i);
    }
  });

  it("never exposes a numeric accuracy field — there is none in the schema to begin with, and an invented one is stripped", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ ...validModelOutput, accuracyPercent: 92, pronunciationScore: "92%" }),
      model: "gpt-4o-mini",
      durationMs: 10,
      totalTokens: 20,
    });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("accuracyPercent");
      expect(result.data).not.toHaveProperty("pronunciationScore");
    }
  });

  it("always sets recognizedTranscript to the REAL transcript passed in, never anything the model's JSON contains", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ ...validModelOutput, recognizedTranscript: "a fabricated transcript the model made up" }),
      model: "gpt-4o-mini",
      durationMs: 10,
      totalTokens: 20,
    });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "the real transcript" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recognizedTranscript).toBe("the real transcript");
    }
  });

  it("always sets limitations to the fixed server-owned disclaimer, even if the model's JSON tries to supply its own", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ ...validModelOutput, limitations: "I am 92% confident in this score" }),
      model: "gpt-4o-mini",
      durationMs: 10,
      totalTokens: 20,
    });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limitations).toBe(PRONUNCIATION_EVALUATION_LIMITATIONS);
      expect(result.data.limitations).toMatch(/not.*acoustic|phoneme/i);
    }
  });

  it("rejects a response with an invalid recognitionQuality enum value", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ ...validModelOutput, recognitionQuality: "92% accurate" }),
      model: "gpt-4o-mini",
      durationMs: 10,
      totalTokens: 20,
    });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(false);
  });

  it("rejects a response missing the required practiceSuggestion field", async () => {
    const incomplete: Record<string, unknown> = { ...validModelOutput };
    delete incomplete.practiceSuggestion;
    mockComplete.mockResolvedValue({ rawText: JSON.stringify(incomplete), model: "gpt-4o-mini", durationMs: 10, totalTokens: 20 });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(false);
  });

  it("rejects malformed JSON rather than fabricating feedback", async () => {
    mockComplete.mockResolvedValue({ rawText: "not json", model: "gpt-4o-mini", durationMs: 10, totalTokens: null });

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(false);
  });

  it("surfaces an honest 'not configured' message rather than a fabricated evaluation when the provider has no API key", async () => {
    mockComplete.mockRejectedValue(new AiProviderError("no key", "not_configured"));

    const result = await evaluatePronunciationTranscript({ targetLanguageName: "French", targetText: "Bonjour", transcript: "Bonjour" });

    expect(result.success).toBe(false);
  });
});
