import { describe, expect, it, vi, beforeEach } from "vitest";

const mockComplete = vi.fn();
vi.mock("@/lib/ai/openaiProvider", () => ({
  openaiProvider: { complete: mockComplete },
}));

const { generateTargetPhrase } = await import("./generatePhrase");
const { AiProviderError } = await import("@/lib/ai/provider");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateTargetPhrase — real Zod validation of provider output", () => {
  it("returns the phrase when the provider responds with valid JSON matching the schema", async () => {
    mockComplete.mockResolvedValue({ rawText: JSON.stringify({ text: "Bonjour, comment ça va ?" }), model: "gpt-4o-mini", durationMs: 10, totalTokens: 5 });

    const result = await generateTargetPhrase({ targetLanguageName: "French", cefrLevel: "B1" });

    expect(result).toEqual({ success: true, data: { text: "Bonjour, comment ça va ?" } });
  });

  it("rejects malformed JSON rather than fabricating a phrase", async () => {
    mockComplete.mockResolvedValue({ rawText: "not json at all", model: "gpt-4o-mini", durationMs: 10, totalTokens: null });

    const result = await generateTargetPhrase({ targetLanguageName: "French", cefrLevel: null });

    expect(result.success).toBe(false);
  });

  it("rejects a response missing the required 'text' field", async () => {
    mockComplete.mockResolvedValue({ rawText: JSON.stringify({ phrase: "wrong key" }), model: "gpt-4o-mini", durationMs: 10, totalTokens: null });

    const result = await generateTargetPhrase({ targetLanguageName: "French", cefrLevel: null });

    expect(result.success).toBe(false);
  });

  it("rejects an empty-string phrase", async () => {
    mockComplete.mockResolvedValue({ rawText: JSON.stringify({ text: "" }), model: "gpt-4o-mini", durationMs: 10, totalTokens: null });

    const result = await generateTargetPhrase({ targetLanguageName: "French", cefrLevel: null });

    expect(result.success).toBe(false);
  });

  it("surfaces an honest 'not configured' message rather than a fabricated phrase when the provider has no API key", async () => {
    mockComplete.mockRejectedValue(new AiProviderError("no key", "not_configured"));

    const result = await generateTargetPhrase({ targetLanguageName: "French", cefrLevel: null });

    expect(result).toEqual({ success: false, errorMessage: expect.stringContaining("isn't available") });
  });
});
