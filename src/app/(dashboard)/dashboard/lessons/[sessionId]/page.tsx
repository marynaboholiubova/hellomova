import { notFound } from "next/navigation";
import { getOwnedLessonSession, listAllLessonMessages } from "@/lib/lessons/dal";
import { getTeacherById } from "@/constants/teachers";
import { getLanguageByCode } from "@/constants/languages";
import { LiveLessonView } from "@/features/lessons/components/LiveLessonView";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // getOwnedLessonSession scopes by session id AND the authenticated
  // caller's id in one query — a session that exists but belongs to a
  // different user looks identical to one that doesn't exist at all.
  const session = await getOwnedLessonSession(sessionId);
  if (!session) {
    notFound();
  }

  const teacher = getTeacherById(session.teacherId);
  const targetLanguage = getLanguageByCode(session.targetLanguageCode);
  const messages = await listAllLessonMessages(session.id);

  return (
    <LiveLessonView
      sessionId={session.id}
      status={session.status}
      teacherName={teacher?.name ?? "Teacher"}
      teacherId={session.teacherId}
      targetLanguageName={targetLanguage?.name ?? session.targetLanguageCode}
      cefrLevel={session.cefrLevel}
      summary={session.summary}
      initialMessages={messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata as {
          correction?: {
            hasCorrection: boolean;
            original: string | null;
            corrected: string | null;
            explanation: string | null;
          };
        } | null,
      }))}
    />
  );
}
