import "server-only";

import * as z from "zod";
import { openaiProvider } from "@/lib/ai/openaiProvider";
import { AiProviderError, type AiChatMessage } from "@/lib/ai/provider";
import { ERROR_CATEGORIES, type ErrorCategory } from "./constants";
import { slugifyPatternKeyFallback } from "./scoring";

/**
 * One real, already-persisted correction from a teacher turn's
 * `lesson_messages.metadata.correction` — NEVER invented by this module.
 * AI here only CLASSIFIES real evidence (assigns a category + a
 * normalized pattern key for grouping); it never originates the
 * correction itself. See AGENTS.md Section 16/17.
 */
export interface ObservedCorrection {
  index: number;
  original: string;
  corrected: string;
  explanation: string | null;
}

export interface ClassifiedCorrection extends ObservedCorrection {
  category: ErrorCategory;
  patternKey: string;
  /** false when the deterministic fallback was used instead of a validated AI classification. */
  aiClassified: boolean;
}

const ErrorClassificationResponseSchema = z.object({
  classifications: z.array(
    z.object({
      index: z.number().int().min(0),
      category: z.enum(ERROR_CATEGORIES),
      patternKey: z.string().min(1).max(60),
    }),
  ),
});

function buildClassificationMessages(corrections: ObservedCorrection[]): AiChatMessage[] {
  const list = corrections
    .map((c) => `${c.index}. Original: "${c.original}" -> Corrected: "${c.corrected}"${c.explanation ? ` (Explanation: ${c.explanation})` : ""}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        "You classify already-made language-learning corrections. You do not invent or judge whether a correction was right — you only categorize corrections that already happened.",
        `Valid categories: ${ERROR_CATEGORIES.join(", ")}.`,
        "For each numbered correction, output a short, stable, lowercase, hyphenated patternKey (max 60 chars) that would match OTHER occurrences of the same underlying mistake pattern (e.g. \"past-tense-irregular-go\", \"third-person-agreement\", \"missing-article\"). Two different corrections of the same underlying pattern must get the exact same patternKey.",
        "Respond with ONLY a single JSON object, no other text, matching exactly this shape:",
        `{ "classifications": [ { "index": number, "category": string, "patternKey": string } ] }`,
        "You must include exactly one classification per numbered correction below, using the same index numbers, with no duplicates and none missing.",
      ].join("\n"),
    },
    {
      role: "user",
      content: list,
    },
  ];
}

function fallbackClassify(corrections: ObservedCorrection[]): ClassifiedCorrection[] {
  return corrections.map((c) => ({
    ...c,
    category: "other",
    patternKey: slugifyPatternKeyFallback(c.corrected || c.original),
    aiClassified: false,
  }));
}

/**
 * Classifies a batch of already-observed corrections. Always resolves —
 * never throws and never blocks ingestion — falling back to a
 * deterministic, non-AI classification (category "other", a slugified
 * pattern key) whenever the provider is unavailable, errors, or returns
 * output that fails validation. This is an all-or-nothing fallback for
 * the whole batch: partial/malformed AI output is rejected outright
 * rather than trusted item-by-item (AGENTS.md: "Do not persist malformed
 * extraction").
 */
export async function classifyObservedCorrections(
  corrections: ObservedCorrection[],
): Promise<ClassifiedCorrection[]> {
  if (corrections.length === 0) {
    return [];
  }

  let rawText: string;
  try {
    const result = await openaiProvider.complete({
      messages: buildClassificationMessages(corrections),
      purpose: "language_brain_classify_errors",
    });
    rawText = result.rawText;
  } catch (error) {
    if (error instanceof AiProviderError) {
      console.error("[languageBrain] classification provider error", { kind: error.kind });
    } else {
      console.error("[languageBrain] unexpected error classifying corrections");
    }
    return fallbackClassify(corrections);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    console.error("[languageBrain] classification response was not valid JSON");
    return fallbackClassify(corrections);
  }

  const validated = ErrorClassificationResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    console.error("[languageBrain] classification response failed schema validation", {
      issueCount: validated.error.issues.length,
    });
    return fallbackClassify(corrections);
  }

  const byIndex = new Map(validated.data.classifications.map((c) => [c.index, c]));
  const expectedIndices = new Set(corrections.map((c) => c.index));
  const coversExactly =
    byIndex.size === expectedIndices.size &&
    [...expectedIndices].every((i) => byIndex.has(i));

  if (!coversExactly) {
    console.error("[languageBrain] classification response did not cover exactly the input indices");
    return fallbackClassify(corrections);
  }

  return corrections.map((c) => {
    const classification = byIndex.get(c.index)!;
    return {
      ...c,
      category: classification.category,
      patternKey: classification.patternKey.trim().toLowerCase().slice(0, 60) || slugifyPatternKeyFallback(c.corrected),
      aiClassified: true,
    };
  });
}
