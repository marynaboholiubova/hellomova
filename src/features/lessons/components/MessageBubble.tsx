import { CorrectionCallout } from "./CorrectionCallout";
import type { LessonUiMessage } from "./LiveLessonView";
import styles from "./MessageBubble.module.css";

export interface MessageBubbleProps {
  message: LessonUiMessage;
  teacherName: string;
}

export function MessageBubble({ message, teacherName }: MessageBubbleProps) {
  const isTeacher = message.role === "teacher";

  return (
    <div className={isTeacher ? styles.teacherRow : styles.learnerRow}>
      <div className={isTeacher ? styles.teacherBubble : styles.learnerBubble}>
        {isTeacher && <p className={styles.sender}>{teacherName}</p>}
        <p className={styles.content}>{message.content}</p>
      </div>
      {isTeacher && message.metadata?.correction?.hasCorrection && (
        <CorrectionCallout correction={message.metadata.correction} />
      )}
    </div>
  );
}
