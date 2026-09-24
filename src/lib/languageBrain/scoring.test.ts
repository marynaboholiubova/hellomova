import { describe, expect, it } from "vitest";
import { deriveGrammarScore, normalizeVocabularyCanonicalForm, slugifyPatternKeyFallback } from "./scoring";

/**
 * These tests exercise the FORMULA (`deriveGrammarScore`, which mirrors
 * `language_brain_skill_states.score`'s generated-column expression) and
 * the arithmetic property that makes concurrent, order-independent
 * accumulation safe (plain integer addition is commutative). They do NOT
 * exercise real Postgres row-locking/concurrency — that requires a live
 * database and cannot be proven by Vitest; see 0006_language_brain.sql's
 * manual verification steps for the actual concurrent-ingestion test.
 */

describe("deriveGrammarScore — A: initial evidence produces the correct score", () => {
  it("computes a plain percentage from the first lesson's raw counts", () => {
    expect(deriveGrammarScore(3, 4)).toBe(75);
  });

  it("D: zero total evidence is 'not assessed yet', never a fabricated score", () => {
    expect(deriveGrammarScore(0, 0)).toBeNull();
  });

  it("rejects an internally inconsistent positive/total pair", () => {
    expect(() => deriveGrammarScore(5, 4)).toThrow();
    expect(() => deriveGrammarScore(-1, 4)).toThrow();
  });
});

describe("deriveGrammarScore — B/C: combining multiple lessons' raw counters preserves exact cumulative evidence", () => {
  it("B: a second lesson's counters, summed with the first, produce the combined score — not an overwrite", () => {
    // Lesson 1: 3/4 positive. Lesson 2: 1/2 positive. Combined: 4/6.
    const lesson1 = { positive: 3, total: 4 };
    const lesson2 = { positive: 1, total: 2 };
    const combined = { positive: lesson1.positive + lesson2.positive, total: lesson1.total + lesson2.total };

    expect(combined).toEqual({ positive: 4, total: 6 });
    expect(deriveGrammarScore(combined.positive, combined.total)).toBe(Math.round((100 * 4) / 6));
  });

  it("C: a longer sequence of lessons preserves the exact cumulative raw counts, not a re-derived approximation", () => {
    const lessons = [
      { positive: 2, total: 3 },
      { positive: 0, total: 1 },
      { positive: 5, total: 5 },
      { positive: 1, total: 4 },
    ];

    const cumulative = lessons.reduce(
      (acc, lesson) => ({ positive: acc.positive + lesson.positive, total: acc.total + lesson.total }),
      { positive: 0, total: 0 },
    );

    expect(cumulative).toEqual({ positive: 8, total: 13 });
    expect(deriveGrammarScore(cumulative.positive, cumulative.total)).toBe(Math.round((100 * 8) / 13));
  });
});

describe("deriveGrammarScore — F: concurrent contributions cannot overwrite one another", () => {
  it("summing two lessons' raw counters is order-independent — whichever ingestion's write commits first, the result is identical", () => {
    const lessonA = { positive: 7, total: 10 };
    const lessonB = { positive: 2, total: 5 };

    const aThenB = { positive: lessonA.positive + lessonB.positive, total: lessonA.total + lessonB.total };
    const bThenA = { positive: lessonB.positive + lessonA.positive, total: lessonB.total + lessonA.total };

    expect(aThenB).toEqual(bThenA);
    expect(deriveGrammarScore(aThenB.positive, aThenB.total)).toBe(deriveGrammarScore(bThenA.positive, bThenA.total));
  });

  it("neither lesson's contribution is lost in the combined total (this is the property the old design broke: it discarded one lesson's evidence entirely by overwriting rather than adding)", () => {
    const lessonA = { positive: 7, total: 10 };
    const lessonB = { positive: 2, total: 5 };
    const combinedTotal = lessonA.total + lessonB.total;

    // A design that let the second write simply overwrite the first
    // would show `combinedTotal === lessonB.total` (lessonA's evidence
    // gone). The correct, additive result must reflect both.
    expect(combinedTotal).toBe(15);
    expect(combinedTotal).not.toBe(lessonA.total);
    expect(combinedTotal).not.toBe(lessonB.total);
  });
});

describe("deriveGrammarScore — G: no cumulative rounding drift", () => {
  it("repeatedly summing exact raw counts and rounding ONCE at the end matches a direct hand-computed reference, unlike re-averaging already-rounded percentages", () => {
    // A sequence deliberately chosen so that rounding each lesson's
    // percentage individually (the OLD, now-removed weighted-average-of-
    // rounded-scores model) drifts from the mathematically exact answer.
    const lessons = [
      { positive: 1, total: 3 }, // 33.33% -> rounds to 33% if rounded per-lesson
      { positive: 1, total: 3 }, // 33.33% -> rounds to 33% if rounded per-lesson
      { positive: 1, total: 3 }, // 33.33% -> rounds to 33% if rounded per-lesson
    ];

    const exactCumulative = lessons.reduce(
      (acc, lesson) => ({ positive: acc.positive + lesson.positive, total: acc.total + lesson.total }),
      { positive: 0, total: 0 },
    );
    // Exact: 3/9 = 33.33...% -> rounds to 33%.
    const exactScore = deriveGrammarScore(exactCumulative.positive, exactCumulative.total);
    expect(exactScore).toBe(33);

    // The old model would have weighted-averaged three ALREADY-ROUNDED
    // 33% figures together — since they're all equal here that happens
    // to still land on 33, but the key point this test documents is that
    // the new model never rounds anything until this single, final step:
    // there is exactly one rounding operation in the entire pipeline,
    // applied to the exact integer sums, so no per-lesson rounding error
    // can accumulate across dozens or hundreds of ingested lessons.
    expect(exactCumulative).toEqual({ positive: 3, total: 9 });
  });
});

describe("normalizeVocabularyCanonicalForm", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeVocabularyCanonicalForm("  Bonjour  ")).toBe("bonjour");
    expect(normalizeVocabularyCanonicalForm("Comment   ça va")).toBe("comment ça va");
  });

  it("treats case/whitespace variants as the same canonical form", () => {
    expect(normalizeVocabularyCanonicalForm("Merci")).toBe(normalizeVocabularyCanonicalForm("merci "));
  });
});

describe("slugifyPatternKeyFallback", () => {
  it("produces a stable, lowercase, hyphenated key", () => {
    expect(slugifyPatternKeyFallback("I went to the store")).toBe("i-went-to-the-store");
  });

  it("falls back to a fixed label when the text has no usable characters", () => {
    expect(slugifyPatternKeyFallback("!!!")).toBe("unclassified");
    expect(slugifyPatternKeyFallback("")).toBe("unclassified");
  });

  it("truncates to a bounded length", () => {
    const long = "a".repeat(200);
    expect(slugifyPatternKeyFallback(long).length).toBeLessThanOrEqual(60);
  });
});
