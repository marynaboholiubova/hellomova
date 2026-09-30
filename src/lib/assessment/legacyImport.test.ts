import { describe, expect, it } from "vitest";
import { mapLegacyPlacementBankToV2Items } from "./legacyImport";
import { EN_PLACEMENT_BANK } from "@/lib/placement/banks/en";

describe("mapLegacyPlacementBankToV2Items — V: legacy placement history/content stays intact and honestly mappable", () => {
  it("maps every v1 question losslessly, without inventing any metadata", () => {
    const mapped = mapLegacyPlacementBankToV2Items(EN_PLACEMENT_BANK, "en");

    expect(mapped).toHaveLength(EN_PLACEMENT_BANK.length);

    for (let i = 0; i < EN_PLACEMENT_BANK.length; i += 1) {
      const original = EN_PLACEMENT_BANK[i];
      const item = mapped[i];

      expect(item.legacyQuestionId).toBe(original.id);
      expect(item.targetLanguageCode).toBe("en");
      expect(item.skill).toBe(original.category);
      expect(item.cefrTarget).toBe(original.level);
      expect(item.version.prompt.text).toBe(original.prompt);
      expect(item.version.prompt.options).toEqual(
        original.options.map((o) => ({ id: o.id, label: o.label })),
      );
      expect(item.version.answerKey.correctOptionId).toBe(original.correctOptionId);
    }
  });

  it("never invents a subskill or difficulty band v1 has no concept of", () => {
    const mapped = mapLegacyPlacementBankToV2Items(EN_PLACEMENT_BANK, "en");

    for (const item of mapped) {
      expect(item).not.toHaveProperty("subskill");
      expect(item.version).not.toHaveProperty("difficultyBand");
    }
  });

  it("maps to a fixed first version, active status — a clean import target, not the answer key itself changed", () => {
    const mapped = mapLegacyPlacementBankToV2Items(EN_PLACEMENT_BANK, "en");

    for (const item of mapped) {
      expect(item.version.versionNumber).toBe(1);
      expect(item.version.status).toBe("active");
      expect(item.version.itemType).toBe("multiple_choice");
    }
  });

  it("does not touch or require the original bank/module in any way beyond reading it", () => {
    const before = JSON.stringify(EN_PLACEMENT_BANK);
    mapLegacyPlacementBankToV2Items(EN_PLACEMENT_BANK, "en");
    const after = JSON.stringify(EN_PLACEMENT_BANK);
    expect(after).toBe(before);
  });
});
