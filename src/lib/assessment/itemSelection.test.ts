import { describe, expect, it, vi, beforeEach } from "vitest";

/** A real filterable in-memory table, so `.eq()`/`.in()` calls genuinely
 * narrow the returned rows the way Postgres would — a fake that just
 * returns everything regardless of filters would let a broken WHERE
 * clause in the real query pass every test. */
function filterableChain(rows: Array<Record<string, unknown>>) {
  let filtered = rows;
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => row[column] === value);
      return obj;
    },
    in: (column: string, values: readonly unknown[]) => {
      const allowed = new Set(values);
      filtered = filtered.filter((row) => allowed.has(row[column]));
      return obj;
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
  };
  return obj;
}

interface FakeOptions {
  items?: Array<{ id: string; skill: string; cefr_target: string; target_language_code?: string }>;
  versions?: Array<{ id: string; item_id: string; item_type: string; prompt: unknown; status?: string }>;
}

function createFakeClient(opts: FakeOptions) {
  return {
    from: (table: string) => {
      if (table === "assessment_items") {
        return filterableChain(
          (opts.items ?? []).map((i) => ({ target_language_code: "en", ...i })),
        );
      }
      if (table === "assessment_item_versions") {
        return filterableChain((opts.versions ?? []).map((v) => ({ status: "active", ...v })));
      }
      return filterableChain([]);
    },
  };
}

let fakeClient: ReturnType<typeof createFakeClient>;
vi.mock("@/lib/supabase/serviceRole", () => ({
  createServiceRoleClient: () => fakeClient,
}));

const { selectAssessmentItems, resolveStartingCefrTarget } = await import("./itemSelection");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectAssessmentItems — C: a language with no v2 bank stays honestly unassessed", () => {
  it("returns an empty array when no items exist for this language/level (never fabricated content)", async () => {
    fakeClient = createFakeClient({ items: [] });

    const result = await selectAssessmentItems("de", "A1");

    expect(result).toEqual([]);
  });

  it("returns an empty array when items exist but no active version does", async () => {
    fakeClient = createFakeClient({
      items: [{ id: "item-1", skill: "grammar", cefr_target: "A1" }],
      versions: [],
    });

    const result = await selectAssessmentItems("en", "A1");

    expect(result).toEqual([]);
  });
});

describe("selectAssessmentItems — bounded selection (never one question, never unbounded)", () => {
  it("caps the number of items served per skill", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}`, skill: "grammar", cefr_target: "A1" }));
    const versions = items.map((item, i) => ({
      id: `version-${i}`,
      item_id: item.id,
      item_type: "multiple_choice",
      prompt: { text: `Q${i}`, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    }));
    fakeClient = createFakeClient({ items, versions });

    const result = await selectAssessmentItems("en", "A1");

    expect(result.length).toBeLessThan(10);
    expect(result.length).toBeGreaterThan(0);
  });

  it("selection is deterministic — the same input always produces the same output", async () => {
    const items = [
      { id: "item-1", skill: "grammar", cefr_target: "A1" },
      { id: "item-2", skill: "vocabulary", cefr_target: "A1" },
    ];
    const versions = [
      { id: "version-a", item_id: "item-1", item_type: "multiple_choice", prompt: { text: "Q1", options: [] } },
      { id: "version-b", item_id: "item-2", item_type: "multiple_choice", prompt: { text: "Q2", options: [] } },
    ];
    fakeClient = createFakeClient({ items, versions });

    const first = await selectAssessmentItems("en", "A1");
    const second = await selectAssessmentItems("en", "A1");

    expect(first.map((i) => i.itemVersionId)).toEqual(second.map((i) => i.itemVersionId));
  });
});

describe("selectAssessmentItems — Y: only genuinely assessable-today skills are ever selected", () => {
  it("never selects listening/speaking/pronunciation items even if they somehow exist in the bank", async () => {
    const items = [
      { id: "item-1", skill: "grammar", cefr_target: "A1" },
      { id: "item-2", skill: "listening", cefr_target: "A1" },
      { id: "item-3", skill: "speaking", cefr_target: "A1" },
    ];
    const versions = items.map((item) => ({
      id: `version-${item.id}`,
      item_id: item.id,
      item_type: "multiple_choice",
      prompt: { text: "Q", options: [] },
    }));
    fakeClient = createFakeClient({ items, versions });

    const result = await selectAssessmentItems("en", "A1");

    expect(result.every((i) => i.skill === "grammar")).toBe(true);
  });
});

describe("resolveStartingCefrTarget", () => {
  it("uses an existing level hint as the anchor when one exists", () => {
    expect(resolveStartingCefrTarget("B1")).toBe("B1");
  });

  it("defaults to A1 for a learner with no prior signal — the same floor placement v1 uses", () => {
    expect(resolveStartingCefrTarget(null)).toBe("A1");
  });
});
