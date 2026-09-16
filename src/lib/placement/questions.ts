import type { CefrLevel } from "@/lib/onboarding/schemas";
import { EN_PLACEMENT_BANK } from "./banks/en";
import { FR_PLACEMENT_BANK } from "./banks/fr";

export type PlacementCategory = "vocabulary" | "grammar" | "reading";

export interface PlacementOption {
  id: string;
  label: string;
}

export interface PlacementQuestion {
  id: string;
  /** The CEFR level this item's content targets — a level tag, not a claim of psychometric calibration. */
  level: CefrLevel;
  category: PlacementCategory;
  prompt: string;
  options: PlacementOption[];
  correctOptionId: string;
}

/** Client-safe question shape — never carries the answer key. */
export type PlacementQuestionPublic = Omit<PlacementQuestion, "correctOptionId">;

export function toPublicQuestion(question: PlacementQuestion): PlacementQuestionPublic {
  return {
    id: question.id,
    level: question.level,
    category: question.category,
    prompt: question.prompt,
    options: question.options,
  };
}

const LEVEL_ORDER: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * The highest level this deterministic MVP will ever administer/score.
 * Three multiple-choice items is not enough evidence to responsibly test
 * for — let alone award — C2, so C2-tagged items (present in the raw
 * bank data below for future phases with richer evidence-gathering) are
 * filtered out before a bank is ever served. scorePlacementTest()
 * enforces the same ceiling independently as defense in depth.
 */
const MAX_SERVED_LEVEL: CefrLevel = "C1";
const SERVED_LEVELS = LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(MAX_SERVED_LEVEL) + 1);

/**
 * One raw bank per target language — one vocabulary + one grammar + one
 * reading item per CEFR level, A1 through C2 (C2 not currently served,
 * see MAX_SERVED_LEVEL above). This is a level-tagged question bank,
 * hand-authored to target that level's content — it has not undergone
 * psychometric or linguistic validation, and nothing in this codebase may
 * describe it as "calibrated," "validated," or "certified." The accurate
 * terms are "CEFR-aligned placement bank" / "CEFR-aligned estimated
 * placement" / "level-tagged question bank". Only languages with a real,
 * hand-authored bank are listed here; every other target language code
 * deliberately has no entry — see getPlacementBank().
 */
const PLACEMENT_BANKS: Record<string, PlacementQuestion[]> = {
  en: EN_PLACEMENT_BANK,
  fr: FR_PLACEMENT_BANK,
};

/**
 * Server-owned placement bank version identifiers, one per target
 * language. Stored with every real placement_test_attempt so historical
 * results stay interpretable if a bank is later revised (e.g. "en-v2"
 * with different items would score differently — the version on old
 * rows tells you which content actually produced that result). Never
 * accept a version string from the client; it is always resolved
 * server-side from the target language, the same way the bank itself is.
 */
const PLACEMENT_BANK_VERSIONS: Record<string, string> = {
  en: "en-v1",
  fr: "fr-v1",
};

/**
 * Returns the CEFR-aligned placement bank for a target language, or
 * `null` if none has been authored yet. `null` must never be papered
 * over with a different language's bank — that is exactly the bug this
 * module exists to prevent. Callers must show an honest "not available
 * yet" fallback instead of substituting content in the wrong language,
 * and must never fabricate a CEFR result when this returns `null`.
 */
export function getPlacementBank(targetLanguageCode: string): PlacementQuestion[] | null {
  const bank = PLACEMENT_BANKS[targetLanguageCode];
  if (!bank || bank.length === 0) {
    return null;
  }

  const served = bank.filter((question) => SERVED_LEVELS.includes(question.level));
  return served.length > 0 ? served : null;
}

/** Server-resolved version tag for the bank a target language would use, or `null` if none exists. */
export function getPlacementBankVersion(targetLanguageCode: string): string | null {
  if (!getPlacementBank(targetLanguageCode)) {
    return null;
  }
  return PLACEMENT_BANK_VERSIONS[targetLanguageCode] ?? null;
}

export function getPlacementQuestionById(
  bank: PlacementQuestion[],
  id: string,
): PlacementQuestion | undefined {
  return bank.find((question) => question.id === id);
}
