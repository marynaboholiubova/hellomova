"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./LessonComposer.module.css";

export interface LessonComposerProps {
  sessionId: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  onOptimisticSend: (text: string) => void;
}

export function LessonComposer({
  sessionId,
  formAction,
  pending,
  error,
  onOptimisticSend,
}: LessonComposerProps) {
  const [text, setText] = useState("");
  const [clientTurnId, setClientTurnId] = useState(() => crypto.randomUUID());
  const [prevPending, setPrevPending] = useState(pending);

  // Adjust state during render rather than in an effect (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // On a pending -> not-pending transition with no error, the submission
  // succeeded: clear the input and mint a fresh idempotency key for the
  // NEXT message. On error, keep both — a retry should reuse the same key
  // and not require retyping.
  if (pending !== prevPending) {
    setPrevPending(pending);
    if (prevPending && !pending && !error) {
      setText("");
      setClientTurnId(crypto.randomUUID());
    }
  }

  function handleSubmit(formData: FormData) {
    const value = formData.get("text");
    // Only add the optimistic bubble on a fresh attempt. When `error` is
    // already set, this submit is a retry of the same clientTurnId (the
    // input/id weren't reset after a failure) — the bubble from the
    // first attempt is already in the list, so adding another here would
    // show a visual duplicate even though the server-side idempotency
    // key prevents an actual duplicate row.
    if (typeof value === "string" && value.trim() && !error) {
      onOptimisticSend(value.trim());
    }
    formAction(formData);
  }

  return (
    <form action={handleSubmit} className={styles.form}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="clientTurnId" value={clientTurnId} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.row}>
        <textarea
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your reply…"
          className={styles.textarea}
          maxLength={1000}
          required
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
