import * as z from "zod";

export const ReviewItemIdSchema = z.string().uuid("Invalid review item.");

/** Simplest real result model appropriate for the current scope — no
 * Review Mode UI exists yet to distinguish "hard"/"easy" (AGENTS.md
 * Section 12). */
export const ReviewResultSchema = z.enum(["again", "good"]);
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
