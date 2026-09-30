import type { PlacementQuestion } from "@/lib/placement/questions";
import type { AssessmentSkill, CefrLevelV2 } from "./constants";

export interface MappedAssessmentItem {
  /** The v1 question id this was mapped from — kept only for
   * traceability/auditing of the import, not stored as a schema column. */
  legacyQuestionId: string;
  targetLanguageCode: string;
  skill: AssessmentSkill;
  cefrTarget: CefrLevelV2;
  version: {
    versionNumber: 1;
    itemType: "multiple_choice";
    prompt: { text: string; options: { id: string; label: string }[] };
    answerKey: { correctOptionId: string };
    status: "active";
  };
}

/**
 * Pure mapping from placement v1's hand-authored bank shape
 * (src/lib/placement/questions.ts's PlacementQuestion) to CEFR v2's
 * item/item-version shape (AGENTS.md Section 14). Every v1 field maps
 * losslessly and honestly:
 *   - category -> skill (vocabulary/grammar/reading are all valid
 *     AssessmentSkill values — no relabeling).
 *   - level -> cefr_target (same CEFR scale, no reinterpretation).
 *   - prompt/options -> prompt (unchanged wording).
 *   - correctOptionId -> answer_key.correctOptionId (unchanged).
 * Fields v1 has no concept of (subskill, difficulty_band) are left
 * undefined rather than invented — "do not invent missing metadata."
 *
 * This function only MAPS in memory — it never writes to the database.
 * Actually seeding CEFR v2 with this content (or any real content) is a
 * deliberate, separate, human-reviewed step, not a side effect of a
 * migration or of running the app — see the Phase delivery report for
 * exactly what remains a manual follow-up.
 */
export function mapLegacyPlacementBankToV2Items(
  bank: PlacementQuestion[],
  targetLanguageCode: string,
): MappedAssessmentItem[] {
  return bank.map((question) => ({
    legacyQuestionId: question.id,
    targetLanguageCode,
    skill: question.category,
    cefrTarget: question.level,
    version: {
      versionNumber: 1,
      itemType: "multiple_choice",
      prompt: {
        text: question.prompt,
        options: question.options.map((option) => ({ id: option.id, label: option.label })),
      },
      answerKey: { correctOptionId: question.correctOptionId },
      status: "active",
    },
  }));
}
