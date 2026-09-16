import { describe, expect, it } from "vitest";
import { getPlacementBank, getPlacementBankVersion } from "./questions";

describe("getPlacementBank — L: no authored bank means no fabricated result", () => {
  it("returns null for a target language with no authored bank", () => {
    expect(getPlacementBank("de")).toBeNull();
    expect(getPlacementBank("ja")).toBeNull();
    expect(getPlacementBank("not-a-real-code")).toBeNull();
  });

  it("has no version for a language with no bank either", () => {
    expect(getPlacementBankVersion("de")).toBeNull();
  });

  it("returns real content for the two authored languages", () => {
    const en = getPlacementBank("en");
    const fr = getPlacementBank("fr");
    expect(en).not.toBeNull();
    expect(fr).not.toBeNull();
    expect(en!.length).toBeGreaterThan(0);
    expect(fr!.length).toBeGreaterThan(0);
  });

  it("never serves a C2-tagged item (capped before it reaches scoring)", () => {
    const en = getPlacementBank("en");
    expect(en!.some((question) => question.level === "C2")).toBe(false);
  });

  it("returns a server-owned version string for authored languages, distinct per language", () => {
    const enVersion = getPlacementBankVersion("en");
    const frVersion = getPlacementBankVersion("fr");
    expect(enVersion).toBe("en-v1");
    expect(frVersion).toBe("fr-v1");
    expect(enVersion).not.toBe(frVersion);
  });
});
