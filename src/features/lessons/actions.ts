"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getOnboardingProfile, getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getOwnedLessonSession, listRecentLessonMessages } from "@/lib/lessons/dal";
import {
  LearnerMessageSchema,
  LessonSessionIdSchema,
  ClientTurnIdSchema,
} from "@/lib/lessons/schemas";
import { CefrLevelSchema } from "@/lib/onboarding/schemas";
import { generateLessonTurn } from "@/lib/lessons/generateTurn";
import { generateLessonSummary } from "@/lib/lessons/generateSummary";
import type { LessonContext, LessonTurnRecord } from "@/lib/lessons/prompt";
import type { LessonSummary } from "@/lib/lessons/schemas";
import { MAX_RECENT_TURNS } from "@/lib/lessons/prompt";
import { checkLessonMessageRateLimit, checkStartLessonRateLimit } from "@/lib/lessons/rateLimit";
import { getLanguageByCode } from "@/constants/languages";
import { getGoalByCode } from "@/constants/goals";
import { getTeacherById } from "@/constants/teachers";
import { toSafeErrorMessage } from "@/lib/utils/errors";
import type { LessonActionState, SendMessageActionState } from "./types";

const PROMPT_VERSION = "lesson-v1";
const RATE_LIMIT_MESSAGE = "You're sending requests a bit fast — please wait a moment and try again.";

/**
 * Builds the server-trusted lesson context for the CALLER's own account.
 * Every field comes from profiles/user_languages/the fixed teacher
 * catalog — never from client input. Returns an error string instead of
 * throwing so callers can surface it as a normal, safe form error.
 */
async function loadTrustedLessonContext(): Promise<
  | { ok: true; context: LessonContext; targetLanguageCode: string; nativeLanguageCode: string; cefrLevel: string | null; learningGoal: string; teacherId: string }
  | { ok: false; error: string }
> {
  const profile = await getOnboardingProfile();

  if (!profile.onboardingCompletedAt || !profile.nativeLanguageCode || !profile.learningGoal || !profile.selectedTeacherId) {
    return { ok: false, error: "Please finish onboarding before starting a lesson." };
  }

  const primaryLanguage = await getPrimaryUserLanguage();
  if (!primaryLanguage) {
    return { ok: false, error: "Please choose a target language before starting a lesson." };
  }

  const teacher = getTeacherById(profile.selectedTeacherId);
  const targetLanguage = getLanguageByCode(primaryLanguage.targetLanguageCode);
  const nativeLanguage = getLanguageByCode(profile.nativeLanguageCode);
  const goal = getGoalByCode(profile.learningGoal);

  if (!teacher || !targetLanguage || !nativeLanguage || !goal) {
    return { ok: false, error: "Something in your profile looks invalid. Please contact support." };
  }

  const cefrResult = CefrLevelSchema.safeParse(primaryLanguage.currentCefrLevel);
  const cefrLevel = cefrResult.success ? cefrResult.data : null;

  return {
    ok: true,
    context: {
      targetLanguageName: targetLanguage.name,
      nativeLanguageName: nativeLanguage.name,
      cefrLevel,
      learningGoalLabel: goal.label,
      teacher,
      mode: "general",
      objective: null,
    },
    targetLanguageCode: primaryLanguage.targetLanguageCode,
    nativeLanguageCode: profile.nativeLanguageCode,
    cefrLevel: primaryLanguage.currentCefrLevel,
    learningGoal: profile.learningGoal,
    teacherId: profile.selectedTeacherId,
  };
}

export async function startLessonAction(
  _state: LessonActionState,
  _formData: FormData,
): Promise<LessonActionState> {
  const profile = await getOnboardingProfile();
  const loaded = await loadTrustedLessonContext();

  if (!loaded.ok) {
    return { error: loaded.error };
  }

  const rateLimit = await checkStartLessonRateLimit(profile.id);
  if (!rateLimit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  const turn = await generateLessonTurn(loaded.context, [], "lesson_start");
  if (!turn.success) {
    return { error: turn.errorMessage };
  }

  // Writes use the service-role client: lesson_sessions/lesson_messages
  // grant NO insert/update to the authenticated role, so this is the
  // only credential that can perform them. user_id below comes from
  // `profile.id`, which is itself derived from the server-verified
  // session inside getOnboardingProfile() — never from client input.
  const supabase = createServiceRoleClient();

  const { data: session, error: sessionError } = await supabase
    .from("lesson_sessions")
    .insert({
      user_id: profile.id,
      target_language_code: loaded.targetLanguageCode,
      native_language_code: loaded.nativeLanguageCode,
      cefr_level: loaded.cefrLevel,
      learning_goal: loaded.learningGoal,
      teacher_id: loaded.teacherId,
      mode: "general",
      prompt_version: PROMPT_VERSION,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { error: toSafeErrorMessage(sessionError, "Couldn't start your lesson. Please try again.") };
  }

  const { error: messageError } = await supabase.from("lesson_messages").insert({
    lesson_session_id: session.id,
    user_id: profile.id,
    role: "teacher",
    content: turn.data.teacherMessage,
    metadata: { correction: turn.data.correction, lessonState: turn.data.lessonState },
  });

  if (messageError) {
    return { error: toSafeErrorMessage(messageError, "Couldn't start your lesson. Please try again.") };
  }

  redirect(`/dashboard/lessons/${session.id}`);
}

export async function sendLessonMessageAction(
  _state: SendMessageActionState,
  formData: FormData,
): Promise<SendMessageActionState> {
  const sessionIdResult = LessonSessionIdSchema.safeParse(formData.get("sessionId"));
  const textResult = LearnerMessageSchema.safeParse(formData.get("text"));
  const clientTurnIdResult = ClientTurnIdSchema.safeParse(formData.get("clientTurnId"));

  if (!sessionIdResult.success) {
    return { error: "Invalid lesson session." };
  }
  if (!clientTurnIdResult.success) {
    return { error: "Invalid request." };
  }
  if (!textResult.success) {
    return { error: textResult.error.issues[0]?.message ?? "Please write a valid message." };
  }

  const sessionId = sessionIdResult.data;
  const clientTurnId = clientTurnIdResult.data;
  const learnerText = textResult.data;

  const session = await getOwnedLessonSession(sessionId);
  if (!session) {
    return { error: "That lesson session couldn't be found." };
  }
  if (session.status !== "active") {
    return { error: "This lesson has already ended." };
  }

  const rateLimit = await checkLessonMessageRateLimit(session.userId);
  if (!rateLimit.allowed) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  // Writes use the service-role client (see startLessonAction's comment
  // and 0005_ai_lesson_engine.sql): lesson_messages grants NO insert to
  // the authenticated role, including for the learner's OWN message —
  // this is what keeps a browser from ever writing a role='teacher' row
  // directly. session.userId comes from getOwnedLessonSession(), which
  // already verified this session belongs to the caller's own
  // server-verified session — never from client input.
  const supabase = createServiceRoleClient();

  const { error: insertError } = await supabase.from("lesson_messages").insert({
    lesson_session_id: sessionId,
    user_id: session.userId,
    role: "learner",
    content: learnerText,
    client_turn_id: clientTurnId,
  });

  if (insertError) {
    // 23505 = unique_violation: this exact (sessionId, clientTurnId) pair
    // was already submitted. Rather than error or duplicate the learner
    // turn, look up what already happened and either replay the
    // existing teacher reply (idempotent success) or, if the earlier
    // attempt never got a reply (e.g. the AI call failed), fall through
    // and generate one now using the already-stored learner message —
    // a safe retry with no duplicate learner turn.
    if (insertError.code === "23505") {
      const existingReply = await findReplyForClientTurn(sessionId, session.userId, clientTurnId);
      if (existingReply) {
        return existingReply;
      }
      // else: fall through to generation below using the stored message.
    } else {
      return { error: toSafeErrorMessage(insertError, "Couldn't send your message. Please try again.") };
    }
  }

  // Continuation context comes ENTIRELY from the session's own snapshot
  // (taken once, at lesson start) — never from a fresh read of the
  // caller's live profile. This is what keeps a lesson internally
  // consistent even if the learner's target language/goal/teacher/CEFR
  // changes elsewhere while the lesson is still open, and it means
  // nothing the client sends in this request (this action never even
  // reads a teacherId/cefrLevel/targetLanguageCode field from formData)
  // can influence which teacher, language, or level this turn uses.
  const teacher = getTeacherById(session.teacherId);
  if (!teacher) {
    return { error: "Something about this lesson looks invalid. Please contact support." };
  }

  const context: LessonContext = {
    targetLanguageName: getLanguageByCode(session.targetLanguageCode)?.name ?? session.targetLanguageCode,
    nativeLanguageName: getLanguageByCode(session.nativeLanguageCode)?.name ?? session.nativeLanguageCode,
    cefrLevel: session.cefrLevel,
    learningGoalLabel: getGoalByCode(session.learningGoal)?.label ?? session.learningGoal,
    teacher,
    mode: "general",
    // Not threaded through from prior turns' metadata in Phase 3 — the
    // bounded recent-turn window below already gives the model full
    // conversational continuity to infer the objective from, rather than
    // this codebase separately tracking and re-injecting it.
    objective: null,
  };

  const recentTurns = await listRecentLessonMessages(sessionId, MAX_RECENT_TURNS);

  const turn = await generateLessonTurn(context, recentTurns, "lesson_continue");
  if (!turn.success) {
    // The learner's message is already saved — they can retry with the
    // same clientTurnId without losing or duplicating it.
    return { error: turn.errorMessage };
  }

  const { error: teacherInsertError } = await supabase.from("lesson_messages").insert({
    lesson_session_id: sessionId,
    user_id: session.userId,
    role: "teacher",
    content: turn.data.teacherMessage,
    metadata: { correction: turn.data.correction, lessonState: turn.data.lessonState },
  });

  if (teacherInsertError) {
    return { error: toSafeErrorMessage(teacherInsertError, "Couldn't get a reply. Please try again.") };
  }

  let sessionStatus: "active" | "completed" = "active";
  let summary: LessonSummary | null = null;

  if (turn.data.lessonState.shouldComplete) {
    sessionStatus = "completed";
    const allTurns: LessonTurnRecord[] = [...recentTurns, { role: "teacher", content: turn.data.teacherMessage }];
    const summaryResult = await generateLessonSummary(context, allTurns);
    summary = summaryResult.success ? summaryResult.data : null;

    await supabase
      .from("lesson_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        summary,
      })
      .eq("id", sessionId)
      .eq("user_id", session.userId);
  }

  return {
    success: true,
    teacherMessage: turn.data.teacherMessage,
    correction: turn.data.correction,
    sessionStatus,
    summary,
  };
}

async function findReplyForClientTurn(
  sessionId: string,
  userId: string,
  clientTurnId: string,
): Promise<SendMessageActionState | null> {
  const supabase = await createClient();

  const { data: learnerRow } = await supabase
    .from("lesson_messages")
    .select("created_at")
    .eq("lesson_session_id", sessionId)
    .eq("user_id", userId)
    .eq("client_turn_id", clientTurnId)
    .maybeSingle();

  if (!learnerRow) {
    return null;
  }

  const { data: teacherRow } = await supabase
    .from("lesson_messages")
    .select("content, metadata")
    .eq("lesson_session_id", sessionId)
    .eq("user_id", userId)
    .eq("role", "teacher")
    .gt("created_at", learnerRow.created_at)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!teacherRow) {
    return null;
  }

  const metadata = teacherRow.metadata as {
    correction?: { hasCorrection: boolean; original: string | null; corrected: string | null; explanation: string | null };
    lessonState?: { shouldComplete: boolean };
  } | null;

  const { data: sessionRow } = await supabase
    .from("lesson_sessions")
    .select("status, summary")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    success: true,
    teacherMessage: teacherRow.content,
    correction:
      metadata?.correction ?? { hasCorrection: false, original: null, corrected: null, explanation: null },
    sessionStatus: sessionRow?.status === "completed" ? "completed" : "active",
    summary: (sessionRow?.summary as LessonSummary | null) ?? null,
  };
}

export async function abandonLessonAction(sessionId: string): Promise<void> {
  const parsed = LessonSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) {
    return;
  }

  const session = await getOwnedLessonSession(parsed.data);
  if (!session || session.status !== "active") {
    return;
  }

  // See startLessonAction's comment: lesson_sessions grants no update to
  // the authenticated role, so abandoning requires the service-role
  // client. Ownership was already verified above via a server-verified
  // session, not client input.
  const supabase = createServiceRoleClient();
  await supabase
    .from("lesson_sessions")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", session.userId);

  redirect("/dashboard");
}
