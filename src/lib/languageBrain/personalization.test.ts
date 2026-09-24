import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MAX_PERSONALIZATION_DUE_VOCABULARY,
  MAX_PERSONALIZATION_GRAMMAR_PATTERNS,
  MAX_PERSONALIZATION_STRENGTHS,
  MAX_PERSONALIZATION_WEAK_AREAS,
} from "./constants";

type CallLogEntry = [string, ...unknown[]];

function chain(result: { data: unknown; error: unknown }, log: CallLogEntry[]) {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      log.push([name, ...args]);
      return obj;
    };

  const obj: Record<string, unknown> = {
    select: record("select"),
    eq: record("eq"),
    in: record("in"),
    order: record("order"),
    limit: record("limit"),
    not: record("not"),
    gte: record("gte"),
    lte: record("lte"),
    maybeSingle: record("maybeSingle"),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

interface FakeResponses {
  grammarPatterns?: unknown[];
  dueReviewItems?: unknown[];
  weakAreas?: unknown[];
  skillStates?: unknown[];
  vocabTerms?: unknown[];
}

function createFakeClient(responses: FakeResponses) {
  const calls: CallLogEntry[] = [];
  let errorPatternCallCount = 0;

  const from = (table: string) => {
    if (table === "language_brain_error_patterns") {
      errorPatternCallCount += 1;
      const data = errorPatternCallCount === 1 ? (responses.grammarPatterns ?? []) : (responses.weakAreas ?? []);
      return chain({ data, error: null }, calls);
    }
    if (table === "language_brain_review_items") {
      return chain({ data: responses.dueReviewItems ?? [], error: null }, calls);
    }
    if (table === "language_brain_skill_states") {
      return chain({ data: responses.skillStates ?? [], error: null }, calls);
    }
    if (table === "language_brain_vocabulary") {
      return chain({ data: responses.vocabTerms ?? [], error: null }, calls);
    }
    return chain({ data: [], error: null }, calls);
  };

  return { from, __calls: calls };
}

let fakeClient: ReturnType<typeof createFakeClient>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient,
}));

const { buildLessonPersonalizationContext } = await import("./personalization");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildLessonPersonalizationContext — Q: the context is bounded", () => {
  it("applies the documented cap to every query, regardless of how much evidence exists", async () => {
    fakeClient = createFakeClient({});
    await buildLessonPersonalizationContext("user-1", "fr");

    const limitCalls = fakeClient.__calls.filter((c) => c[0] === "limit").map((c) => c[1]);
    expect(limitCalls.sort()).toEqual(
      [
        MAX_PERSONALIZATION_GRAMMAR_PATTERNS,
        MAX_PERSONALIZATION_DUE_VOCABULARY,
        MAX_PERSONALIZATION_WEAK_AREAS,
        MAX_PERSONALIZATION_STRENGTHS,
      ].sort(),
    );
  });
});

describe("buildLessonPersonalizationContext — R: scoped only to the given target language", () => {
  it("filters every query by the passed target_language_code", async () => {
    fakeClient = createFakeClient({});
    await buildLessonPersonalizationContext("user-1", "fr");

    const targetLanguageFilters = fakeClient.__calls.filter(
      (c) => c[0] === "eq" && c[1] === "target_language_code",
    );
    expect(targetLanguageFilters.length).toBeGreaterThan(0);
    for (const filter of targetLanguageFilters) {
      expect(filter[2]).toBe("fr");
    }
  });

  it("never filters or references teacher in any query — Language Brain is not teacher-scoped", async () => {
    fakeClient = createFakeClient({});
    await buildLessonPersonalizationContext("user-1", "fr");

    const teacherReferences = fakeClient.__calls.filter((c) =>
      c.some((arg) => typeof arg === "string" && arg.toLowerCase().includes("teacher")),
    );
    expect(teacherReferences).toHaveLength(0);
  });
});

describe("buildLessonPersonalizationContext — content shaping", () => {
  it("returns all-empty arrays when there is no evidence yet", async () => {
    fakeClient = createFakeClient({});
    const context = await buildLessonPersonalizationContext("user-1", "fr");

    expect(context).toEqual({ topGrammarPatterns: [], dueVocabulary: [], weakAreas: [], strengths: [] });
  });

  it("formats recurring grammar patterns with occurrence count and a real example", async () => {
    fakeClient = createFakeClient({
      grammarPatterns: [
        { pattern_key: "past-irregular-go", occurrence_count: 3, example_original: "I goed", example_corrected: "I went" },
      ],
    });

    const context = await buildLessonPersonalizationContext("user-1", "fr");

    expect(context.topGrammarPatterns[0]).toContain("past irregular go");
    expect(context.topGrammarPatterns[0]).toContain("3 times");
    expect(context.topGrammarPatterns[0]).toContain("I goed");
    expect(context.topGrammarPatterns[0]).toContain("I went");
  });

  it("resolves due vocabulary review items to their surface form", async () => {
    fakeClient = createFakeClient({
      dueReviewItems: [{ source_id: "vocab-1", source_type: "vocabulary" }],
      vocabTerms: [{ id: "vocab-1", surface_form: "reservation" }],
    });

    const context = await buildLessonPersonalizationContext("user-1", "fr");

    expect(context.dueVocabulary).toEqual(["reservation"]);
  });

  it("only surfaces strengths that meet the score and evidence thresholds (enforced by the query, not re-checked in JS)", async () => {
    fakeClient = createFakeClient({
      skillStates: [{ skill: "grammar", score: 82, evidence_count: 40 }],
    });

    const context = await buildLessonPersonalizationContext("user-1", "fr");

    expect(context.strengths).toEqual(["grammar (82% over 40 messages)"]);
  });
});
