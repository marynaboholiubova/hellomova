import "server-only";

import { cache } from "react";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/onboarding/schemas";
import type { LessonSummary } from "./schemas";
import type { LessonTurnRecord } from "./prompt";

export interface LessonSessionRecord {
  id: string;
  userId: string;
  targetLanguageCode: string;
  nativeLanguageCode: string;
  cefrLevel: CefrLevel | null;
  learningGoal: string;
  teacherId: string;
  mode: string;
  status: "active" | "completed" | "abandoned";
  promptVersion: string;
  summary: LessonSummary | null;
  startedAt: string;
  completedAt: string | null;
}

const LESSON_SESSION_COLUMNS =
  "id, user_id, target_language_code, native_language_code, cefr_level, learning_goal, teacher_id, mode, status, prompt_version, summary, started_at, completed_at";

function toLessonSessionRecord(data: {
  id: string;
  user_id: string;
  target_language_code: string;
  native_language_code: string;
  cefr_level: string | null;
  learning_goal: string;
  teacher_id: string;
  mode: string;
  status: string;
  prompt_version: string;
  summary: unknown;
  started_at: string;
  completed_at: string | null;
}): LessonSessionRecord {
  return {
    id: data.id,
    userId: data.user_id,
    targetLanguageCode: data.target_language_code,
    nativeLanguageCode: data.native_language_code,
    cefrLevel: data.cefr_level as CefrLevel | null,
    learningGoal: data.learning_goal,
    teacherId: data.teacher_id,
    mode: data.mode,
    status: data.status as LessonSessionRecord["status"],
    promptVersion: data.prompt_version,
    summary: (data.summary as LessonSummary | null) ?? null,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  };
}

/**
 * Loads a lesson session scoped to BOTH the session id AND the
 * authenticated caller's id in the same query, so "doesn't exist" and
 * "exists but isn't yours" are indistinguishable to the caller — no
 * separate existence check that could leak which session ids are valid.
 */
export async function getOwnedLessonSession(sessionId: string): Promise<LessonSessionRecord | null> {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_sessions")
    .select(LESSON_SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data ? toLessonSessionRecord(data) : null;
}

/** The caller's most recent still-active lesson session, if any — used to offer "Continue lesson" on the dashboard. */
export const getActiveLessonSession = cache(async (): Promise<LessonSessionRecord | null> => {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_sessions")
    .select(LESSON_SESSION_COLUMNS)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data ? toLessonSessionRecord(data) : null;
});

export async function listRecentLessonMessages(
  sessionId: string,
  limit: number,
): Promise<LessonTurnRecord[]> {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_messages")
    .select("role, content, created_at")
    .eq("lesson_session_id", sessionId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({ role: row.role as "teacher" | "learner", content: row.content }));
}

export interface LessonMessageRecord {
  id: string;
  role: "teacher" | "learner";
  content: string;
  metadata: unknown;
  createdAt: string;
}

/** Full message history for rendering the lesson UI (not the bounded AI context window). */
export async function listAllLessonMessages(sessionId: string): Promise<LessonMessageRecord[]> {
  const { user } = await verifySession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_messages")
    .select("id, role, content, metadata, created_at")
    .eq("lesson_session_id", sessionId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as "teacher" | "learner",
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}
