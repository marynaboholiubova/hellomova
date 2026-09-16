"use client";

import { useState } from "react";
import { useActionState } from "react";
import { selectTeacherAction } from "@/features/onboarding/actions";
import { TeacherCard } from "./TeacherCard";
import { Button } from "@/components/ui/Button";
import type { TeacherOption } from "@/constants/teachers";
import styles from "./OnboardingForm.module.css";
import listStyles from "./OptionList.module.css";

export interface TeacherFormProps {
  teachers: TeacherOption[];
  defaultValue: string | null;
}

export function TeacherForm({ teachers, defaultValue }: TeacherFormProps) {
  const [state, action, pending] = useActionState(selectTeacherAction, undefined);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const selectedTeacher = teachers.find((teacher) => teacher.id === selected);

  return (
    <form action={action} className={styles.form}>
      <div className={listStyles.list} role="radiogroup" aria-label="AI teacher">
        {teachers.map((teacher) => (
          <TeacherCard
            key={teacher.id}
            id={teacher.id}
            name={teacher.name}
            title={teacher.title}
            description={teacher.description}
            fieldName="teacherId"
            checked={selected === teacher.id}
            onSelect={setSelected}
          />
        ))}
      </div>
      {state?.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={!selectedTeacher || pending} fullWidth>
        {pending
          ? "Saving…"
          : selectedTeacher
            ? `Continue with ${selectedTeacher.name}`
            : "Continue"}
      </Button>
    </form>
  );
}
