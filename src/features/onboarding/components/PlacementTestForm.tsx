"use client";

import { useState, type FormEvent } from "react";
import { useActionState } from "react";
import { submitPlacementTestAction } from "@/features/onboarding/actions";
import { PlacementQuestion } from "./PlacementQuestion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PlacementQuestionPublic } from "@/lib/placement/questions";
import type { PlacementUiStrings } from "@/lib/placement/uiStrings";
import styles from "./PlacementTestForm.module.css";
import formStyles from "./OnboardingForm.module.css";

export interface PlacementTestFormProps {
  questions: PlacementQuestionPublic[];
  uiStrings: PlacementUiStrings;
}

export function PlacementTestForm({ questions, uiStrings }: PlacementTestFormProps) {
  const [state, action, pending] = useActionState(submitPlacementTestAction, undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentQuestion = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const canAdvance = Boolean(answers[currentQuestion.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isLast) {
      event.preventDefault();
      if (canAdvance) {
        setCurrentIndex((index) => index + 1);
      }
    }
    // On the last question, canAdvance gating still applies via the
    // disabled submit button, and the form submits normally into `action`.
  }

  return (
    <form action={action} onSubmit={handleSubmit} className={formStyles.form}>
      <Card className={styles.questionCard}>
        <p className={styles.counter}>
          {uiStrings.questionCounter(currentIndex + 1, questions.length)}
        </p>
        <p className={styles.prompt}>{currentQuestion.prompt}</p>
      </Card>
      <PlacementQuestion
        question={currentQuestion}
        selectedOptionId={answers[currentQuestion.id]}
        onSelect={(optionId) =>
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionId }))
        }
      />
      {questions.slice(0, currentIndex).map((question) => (
        <input
          key={question.id}
          type="hidden"
          name={`answer-${question.id}`}
          value={answers[question.id] ?? ""}
        />
      ))}
      {state?.error && (
        <p className={formStyles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={!canAdvance || pending} fullWidth>
        {isLast
          ? pending
            ? uiStrings.scoringButton
            : uiStrings.seeMyLevelButton
          : uiStrings.nextButton}
      </Button>
    </form>
  );
}
