"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { startPronunciationAttemptAction, submitPronunciationAttemptAction } from "@/features/pronunciation/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import styles from "./PronunciationPractice.module.css";

export interface PronunciationPracticeProps {
  targetLanguageName: string;
}

type RecorderState =
  | "idle"
  | "unsupported"
  | "requesting_permission"
  | "permission_denied"
  | "recording"
  | "recorded";

/**
 * Ordered by preference — the FIRST type the browser's MediaRecorder
 * actually supports is used. Never a hardcoded single codec: Chrome/
 * Firefox and Safari don't reliably agree on one, and requiring a
 * specific codec would break recording for a real share of visitors (see
 * AGENTS.md's "Pronunciation / Mary" section, Section 22 of the brief).
 */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

export function PronunciationPractice({ targetLanguageName }: PronunciationPracticeProps) {
  const [startState, startAction, startPending] = useActionState(startPronunciationAttemptAction, undefined);
  const [submitState, submitAction, submitPending] = useActionState(submitPronunciationAttemptAction, undefined);

  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasSubmittedThisAttempt, setHasSubmittedThisAttempt] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const attempt = startState && "success" in startState ? startState : null;
  const result = hasSubmittedThisAttempt && submitState && "success" in submitState ? submitState : null;
  const submitError = hasSubmittedThisAttempt && submitState && "error" in submitState ? submitState.error : null;

  // Release the microphone and any object URL on unmount, or whenever a
  // new recording replaces the previous one — never leak a live mic track.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function resetRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecorderState("idle");
    setHasSubmittedThisAttempt(false);
  }

  function handleNextPhrase() {
    resetRecording();
    startAction(new FormData());
  }

  async function handleStartRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecorderState("unsupported");
      return;
    }
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setRecorderState("unsupported");
      return;
    }

    setRecorderState("requesting_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecorderState("recorded");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecorderState("recording");
    } catch {
      setRecorderState("permission_denied");
    }
  }

  function handleStopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function handleSubmit() {
    if (!attempt?.success || !audioBlob) return;
    const mimeType = audioBlob.type || "audio/webm";
    const formData = new FormData();
    formData.set("attemptId", attempt.attemptId);
    formData.set("audio", audioBlob, `attempt.${extensionForMimeType(mimeType)}`);
    setHasSubmittedThisAttempt(true);
    submitAction(formData);
  }

  if (!attempt) {
    return (
      <Card className={styles.card}>
        <p className={styles.intro}>
          Record yourself saying a phrase in {targetLanguageName}, and get honest, transcript-based feedback from
          Mary.
        </p>
        {startState && "error" in startState && (
          <p className={styles.error} role="alert">
            {startState.error}
          </p>
        )}
        <Button onClick={() => startAction(new FormData())} disabled={startPending} fullWidth>
          {startPending ? "Preparing a phrase…" : "Start"}
        </Button>
      </Card>
    );
  }

  if (result?.success) {
    return (
      <Card className={styles.card}>
        <p className={styles.phraseLabel}>You said</p>
        <p className={styles.phrase}>{attempt.targetText}</p>

        {result.status === "completed" ? (
          <div className={styles.resultBlock}>
            <p className={styles.transcriptLabel}>What the speech recognizer heard</p>
            <p className={styles.transcript}>
              {result.transcript.length > 0 ? `"${result.transcript}"` : "(no speech detected)"}
            </p>
            <div className={styles.evaluationRow}>
              <span className={styles.badgeLabelled}>
                <span className={styles.badgeCaption}>Recognition</span>
                <span className={styles.badge} data-level={result.evaluation.recognitionQuality}>
                  {result.evaluation.recognitionQuality.replace(/_/g, " ")}
                </span>
              </span>
              <span className={styles.badgeLabelled}>
                <span className={styles.badgeCaption}>Matches target</span>
                <span className={styles.badge} data-level={result.evaluation.contentMatch}>
                  {result.evaluation.contentMatch.replace(/_/g, " ")}
                </span>
              </span>
            </div>
            {result.evaluation.differences.length > 0 && (
              <ul className={styles.observations}>
                {result.evaluation.differences.map((difference) => (
                  <li key={difference}>{difference}</li>
                ))}
              </ul>
            )}
            <p className={styles.practiceSuggestionLabel}>Practice tip</p>
            <p className={styles.practiceSuggestion}>{result.evaluation.practiceSuggestion}</p>
            <p className={styles.limitations}>{result.evaluation.limitations}</p>
          </div>
        ) : (
          <p className={styles.error} role="alert">
            {result.errorReason}
          </p>
        )}

        <Button onClick={handleNextPhrase} disabled={startPending} fullWidth>
          Try a new phrase
        </Button>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <p className={styles.phraseLabel}>Say this phrase</p>
      <p className={styles.phrase}>{attempt.targetText}</p>

      {recorderState === "unsupported" && (
        <p className={styles.error} role="alert">
          Your browser doesn&apos;t support audio recording. Please try a recent version of Chrome, Firefox, Safari,
          or Edge.
        </p>
      )}
      {recorderState === "permission_denied" && (
        <p className={styles.error} role="alert">
          Microphone access was denied. Please allow microphone access and try again.
        </p>
      )}
      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      {(recorderState === "idle" || recorderState === "permission_denied" || recorderState === "unsupported") && (
        <Button onClick={handleStartRecording} fullWidth>
          Record
        </Button>
      )}

      {recorderState === "requesting_permission" && (
        <Button disabled fullWidth>
          Waiting for microphone permission…
        </Button>
      )}

      {recorderState === "recording" && (
        <Button onClick={handleStopRecording} variant="secondary" fullWidth>
          <span className={styles.recordingIndicator} aria-hidden="true" /> Recording… tap to stop
        </Button>
      )}

      {recorderState === "recorded" && audioUrl && (
        <div className={styles.recordedBlock}>
          {/* A real native player for the real recording — no fake waveform, since no real waveform data is computed here. */}
          <audio controls src={audioUrl} className={styles.audioPlayer} />
          <div className={styles.recordedActions}>
            <Button onClick={handleStartRecording} variant="secondary">
              Re-record
            </Button>
            <Button onClick={handleSubmit} disabled={submitPending}>
              {submitPending ? "Checking…" : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
