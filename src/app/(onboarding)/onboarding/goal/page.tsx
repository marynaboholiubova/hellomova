import { requireOnboardingStep } from "@/lib/onboarding/dal";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { GoalForm } from "@/features/onboarding/components/GoalForm";
import { GOALS } from "@/constants/goals";
import styles from "@/features/onboarding/components/OnboardingPage.module.css";

export default async function GoalPage() {
  const profile = await requireOnboardingStep("goal");

  return (
    <div className={styles.stack}>
      <StepProgress currentStepNumber={3} totalSteps={7} label="Learning goal" />
      <div>
        <h1 className={styles.heading}>What&apos;s your main goal?</h1>
        <p className={styles.description}>We&apos;ll build your learning path around it.</p>
      </div>
      <GoalForm goals={GOALS} defaultValue={profile.learningGoal} />
    </div>
  );
}
