import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ASSESSABLE_SKILLS_TODAY, type AssessmentSkill, type ItemType } from "./constants";

export interface SelectedItemVersion {
  itemVersionId: string;
  itemId: string;
  skill: AssessmentSkill;
  itemType: ItemType;
  cefrTarget: string;
  /** Unvalidated at this layer — the caller (submit.ts /
   * features/assessment/actions.ts) parses this against McqPromptSchema /
   * WritingPromptSchema before it ever reaches a client. */
  prompt: unknown;
}

/** Bounded per skill — "one single question must never determine a
 * user's level" (AGENTS.md Section 13). Not a policy-tunable value (no
 * active policy exists for exposure control yet), just a fixed, honest,
 * small default. */
const ITEMS_PER_SKILL = 3;

/**
 * Deterministically selects ACTIVE item versions for one target language,
 * bounded to skills this product can genuinely assess today (never
 * listening/speaking/pronunciation — see ASSESSABLE_SKILLS_TODAY), at one
 * CEFR band. Returns [] — never fabricated content — when no active items
 * exist for this language/band, the same honest "unavailable" contract
 * placement v1's getPlacementBank() already uses.
 *
 * Selection is a stable, deterministic sort (by item_version id), NOT
 * randomized and NOT adaptive: no exposure-control or psychometric policy
 * exists yet to randomize or adapt against (AGENTS.md Section 12/13). The
 * architecture (versioned items, per-skill bounding) is ready for a real
 * adaptive/exposure-aware selector later without a schema change — this
 * function is deliberately the simplest honest thing that works today.
 */
export async function selectAssessmentItems(
  targetLanguageCode: string,
  cefrTarget: string,
): Promise<SelectedItemVersion[]> {
  const supabase = createServiceRoleClient();

  const { data: items, error: itemsError } = await supabase
    .from("assessment_items")
    .select("id, skill, cefr_target")
    .eq("target_language_code", targetLanguageCode)
    .eq("cefr_target", cefrTarget)
    .in("skill", ASSESSABLE_SKILLS_TODAY);

  if (itemsError || !items || items.length === 0) {
    return [];
  }

  const { data: versions, error: versionsError } = await supabase
    .from("assessment_item_versions")
    .select("id, item_id, item_type, prompt")
    .in(
      "item_id",
      items.map((i) => i.id),
    )
    .eq("status", "active");

  if (versionsError || !versions || versions.length === 0) {
    return [];
  }

  const itemById = new Map(items.map((i) => [i.id, i]));

  const bySkill = new Map<string, SelectedItemVersion[]>();
  for (const version of versions) {
    const item = itemById.get(version.item_id);
    if (!item) continue;

    const entry: SelectedItemVersion = {
      itemVersionId: version.id,
      itemId: version.item_id,
      skill: item.skill as AssessmentSkill,
      itemType: version.item_type as ItemType,
      cefrTarget: item.cefr_target,
      prompt: version.prompt,
    };

    const list = bySkill.get(item.skill) ?? [];
    list.push(entry);
    bySkill.set(item.skill, list);
  }

  const selected: SelectedItemVersion[] = [];
  for (const versionsForSkill of bySkill.values()) {
    const sorted = [...versionsForSkill].sort((a, b) => a.itemVersionId.localeCompare(b.itemVersionId));
    selected.push(...sorted.slice(0, ITEMS_PER_SKILL));
  }

  return selected;
}

/**
 * The starting CEFR band for a learner's first v2 assessment: their
 * existing learning/estimated level if one exists (a reasonable anchor —
 * AGENTS.md Section 13's "screening/anchor" concept, without a full
 * multi-round adaptive algorithm this phase doesn't have evidence to
 * justify), or A1 for a learner with no prior signal at all — the same
 * floor placement v1 uses for anyone who has taken it.
 */
export function resolveStartingCefrTarget(existingLevelHint: string | null): string {
  return existingLevelHint ?? "A1";
}
