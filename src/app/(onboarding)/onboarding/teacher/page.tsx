import { requireOnboardingStep } from "@/lib/onboarding/dal";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { TeacherForm } from "@/features/onboarding/components/TeacherForm";
import { TEACHERS } from "@/constants/teachers";
import styles from "@/features/onboarding/components/OnboardingPage.module.css";

export default async function TeacherPage() {
  const profile = await requireOnboardingStep("teacher");

  return (
    <div className={styles.stack}>
      <StepProgress currentStepNumber={7} totalSteps={7} label="Choose your AI teacher" />
      <div>
        <h1 className={styles.heading}>Choose your teacher</h1>
        <p className={styles.description}>
          You can switch anytime. Every teacher shares the same Language Brain.
        </p>
      </div>
      <TeacherForm teachers={TEACHERS} defaultValue={profile.selectedTeacherId} />
    </div>
  );
}
