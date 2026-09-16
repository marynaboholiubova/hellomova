"use client";

import { useActionState } from "react";
import { saveNativeLanguageAction } from "@/features/onboarding/actions";
import { LanguagePicker } from "./LanguagePicker";
import { Button } from "@/components/ui/Button";
import type { LanguageOption } from "@/constants/languages";
import styles from "./OnboardingForm.module.css";

export interface NativeLanguageFormProps {
  languages: LanguageOption[];
  defaultValue: string | null;
}

export function NativeLanguageForm({ languages, defaultValue }: NativeLanguageFormProps) {
  const [state, action, pending] = useActionState(saveNativeLanguageAction, undefined);

  return (
    <form action={action} className={styles.form}>
      <LanguagePicker
        name="nativeLanguageCode"
        languages={languages}
        defaultValue={defaultValue}
      />
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
