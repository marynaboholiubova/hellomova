import { describe, expect, it, vi, beforeEach } from "vitest";

const mockComplete = vi.fn();
vi.mock("@/lib/ai/openaiProvider", () => ({
  openaiProvider: { complete: mockComplete },
}));

const { classifyObservedCorrections } = await import("./errorClassification");

const SAMPLE: Parameters<typeof classifyObservedCorrections>[0] = [
  { index: 0, original: "I goed to the store", corrected: "I went to the store", explanation: "irregular past tense" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyObservedCorrections — N: malformed AI extraction is rejected, never persisted as-is", () => {
  it("falls back deterministically when the response is not valid JSON", async () => {
    mockComplete.mockResolvedValue({ rawText: "not json", model: "x", durationMs: 1, totalTokens: null });

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0].aiClassified).toBe(false);
    expect(result[0].category).toBe("other");
  });

  it("falls back when the response fails schema validation (wrong category enum value)", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ classifications: [{ index: 0, category: "not_a_real_category", patternKey: "x" }] }),
      model: "x",
      durationMs: 1,
      totalTokens: null,
    });

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0].aiClassified).toBe(false);
  });

  it("falls back when the response omits an index that was in the input", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({ classifications: [] }),
      model: "x",
      durationMs: 1,
      totalTokens: null,
    });

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0].aiClassified).toBe(false);
  });

  it("falls back when the response duplicates an index instead of covering all of them", async () => {
    const two = [...SAMPLE, { index: 1, original: "He have", corrected: "He has", explanation: null }];
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({
        classifications: [
          { index: 0, category: "tense", patternKey: "past-irregular" },
          { index: 0, category: "tense", patternKey: "past-irregular" },
        ],
      }),
      model: "x",
      durationMs: 1,
      totalTokens: null,
    });

    const result = await classifyObservedCorrections(two);

    expect(result.every((r) => !r.aiClassified)).toBe(true);
  });

  it("falls back when the provider throws", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0].aiClassified).toBe(false);
    expect(result[0].category).toBe("other");
  });

  it("never fabricates a correction that wasn't in the input — the fallback preserves the exact original/corrected text", async () => {
    mockComplete.mockRejectedValue(new Error("boom"));

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0].original).toBe(SAMPLE[0].original);
    expect(result[0].corrected).toBe(SAMPLE[0].corrected);
  });
});

describe("classifyObservedCorrections — successful AI classification", () => {
  it("uses the validated AI classification when it covers every input index exactly once", async () => {
    mockComplete.mockResolvedValue({
      rawText: JSON.stringify({
        classifications: [{ index: 0, category: "tense", patternKey: "past-irregular-go" }],
      }),
      model: "x",
      durationMs: 1,
      totalTokens: null,
    });

    const result = await classifyObservedCorrections(SAMPLE);

    expect(result[0]).toMatchObject({ category: "tense", patternKey: "past-irregular-go", aiClassified: true });
  });

  it("returns an empty array without calling the provider when there is nothing to classify", async () => {
    const result = await classifyObservedCorrections([]);

    expect(result).toEqual([]);
    expect(mockComplete).not.toHaveBeenCalled();
  });
});
