import { getPrimaryUserLanguage, requireOnboardingStep } from "@/lib/onboarding/dal";
import { advancePersonalPlanAction } from "@/features/onboarding/actions";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { Button } from "@/components/ui/Button";
import { getGoalByCode } from "@/constants/goals";
import { CefrLevelSchema } from "@/lib/onboarding/schemas";
import { generatePersonalPlan } from "@/lib/plan/generatePlan";
import stackStyles from "@/features/onboarding/components/OnboardingPage.module.css";
import styles from "./page.module.css";

export default async function PersonalPlanPage() {
  const profile = await requireOnboardingStep("personal-plan");
  const primaryLanguage = await getPrimaryUserLanguage();
  const goal = profile.learningGoal ? getGoalByCode(profile.learningGoal) : null;

  const cefrResult = CefrLevelSchema.safeParse(primaryLanguage?.currentCefrLevel);
  const plan = cefrResult.success
    ? generatePersonalPlan(cefrResult.data, profile.learningGoal ?? "general")
    : null;

  return (
    <div className={stackStyles.stack}>
      <StepProgress currentStepNumber={6} totalSteps={7} label="Personal plan" />
      <div>
        <h1 className={styles.heading}>Your plan</h1>
        <p className={styles.description}>
          A simple starting plan based on what you&apos;ve told us — this will get
          richer as you learn.
        </p>
      </div>
      {plan ? (
        <>
          <p className={styles.focus}>Focus: {plan.focus}</p>
          <div className={styles.chipList}>
            <p className={`${styles.chip} ${styles.chipPrimary}`}>
              {plan.minutesPerDay} min/day
            </p>
            <p className={styles.chip}>{plan.daysPerWeek} days/week</p>
            {goal && <p className={styles.chip}>Goal: {goal.label}</p>}
          </div>
        </>
      ) : (
        <p className={styles.description}>
          Your level hasn&apos;t been assessed yet, so we can&apos;t build a
          detailed plan yet. Once a real placement test is available and
          you&apos;ve taken it, your plan will appear here.
        </p>
      )}
      <form action={advancePersonalPlanAction}>
        <Button type="submit" fullWidth>
          Build my plan
        </Button>
      </form>
    </div>
  );
}
