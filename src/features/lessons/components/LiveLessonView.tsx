"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendLessonMessageAction, abandonLessonAction } from "@/features/lessons/actions";
import { TeacherAvatar } from "@/features/onboarding/components/TeacherAvatar";
import { MessageBubble } from "./MessageBubble";
import { LessonComposer } from "./LessonComposer";
import { LessonSummaryView } from "./LessonSummaryView";
import { Button } from "@/components/ui/Button";
import type { LessonSummary } from "@/lib/lessons/schemas";
import type { LessonCorrection } from "@/features/lessons/types";
import styles from "./LiveLessonView.module.css";

export interface LessonUiMessage {
  id: string;
  role: "teacher" | "learner";
  content: string;
  metadata: { correction?: LessonCorrection } | null;
}

export interface LiveLessonViewProps {
  sessionId: string;
  status: "active" | "completed" | "abandoned";
  teacherName: string;
  teacherId: string;
  targetLanguageName: string;
  cefrLevel: string | null;
  summary: LessonSummary | null;
  initialMessages: LessonUiMessage[];
}

export function LiveLessonView({
  sessionId,
  status: initialStatus,
  teacherName,
  teacherId,
  targetLanguageName,
  cefrLevel,
  summary: initialSummary,
  initialMessages,
}: LiveLessonViewProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [summary, setSummary] = useState(initialSummary);
  const [state, formAction, pending] = useActionState(sendLessonMessageAction, undefined);
  const [lastHandledState, setLastHandledState] = useState<typeof state>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  // Adjust state during render rather than in an effect (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) —
  // a new successful action result is external input arriving via props/state,
  // not something to resynchronize after the fact.
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state && "success" in state && state.success) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${prev.length}-${Date.now()}`,
          role: "teacher",
          content: state.teacherMessage,
          metadata: { correction: state.correction },
        },
      ]);
      if (state.sessionStatus === "completed") {
        setStatus("completed");
        setSummary(state.summary);
      }
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleOptimisticSend(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: `local-learner-${prev.length}-${Date.now()}`, role: "learner", content: text, metadata: null },
    ]);
  }

  const errorMessage = state && "error" in state ? state.error : null;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.teacherIdentity}>
          <TeacherAvatar teacherId={teacherId} size={40} />
          <div>
            <p className={styles.teacherName}>{teacherName}</p>
            <p className={styles.meta}>
              {targetLanguageName} • {cefrLevel ?? "Not yet assessed"}
            </p>
          </div>
        </div>
        {status === "active" && (
          <form action={() => abandonLessonAction(sessionId)}>
            <Button type="submit" variant="ghost">
              End lesson
            </Button>
          </form>
        )}
      </header>

      <div className={styles.messages}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} teacherName={teacherName} />
        ))}
        <div ref={endRef} />
      </div>

      {status === "active" ? (
        <LessonComposer
          sessionId={sessionId}
          formAction={formAction}
          pending={pending}
          error={errorMessage}
          onOptimisticSend={handleOptimisticSend}
        />
      ) : (
        <LessonSummaryView status={status} summary={summary} />
      )}
    </div>
  );
}
