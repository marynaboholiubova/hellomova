import {
  getLatestPlacementAttempt,
  getPrimaryUserLanguage,
  requireOnboardingStep,
} from "@/lib/onboarding/dal";
import { advanceFromResultAction } from "@/features/onboarding/actions";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { Button } from "@/components/ui/Button";
import { getLanguageByCode } from "@/constants/languages";
import { CEFR_LABELS } from "@/constants/cefr";
import { CefrLevelSchema } from "@/lib/onboarding/schemas";
import stackStyles from "@/features/onboarding/components/OnboardingPage.module.css";
import styles from "./page.module.css";

export default async function ResultPage() {
  await requireOnboardingStep("result");
  const primaryLanguage = await getPrimaryUserLanguage();
  const attempt = await getLatestPlacementAttempt();

  const language = primaryLanguage ? getLanguageByCode(primaryLanguage.targetLanguageCode) : null;
  // The level always comes from user_languages.current_cefr_level. It is
  // null whenever no real test has been scored for this language — that
  // is the one and only source of truth for "assessed" vs "not assessed
  // yet". Nothing here may substitute an invented level for a null one.
  const levelResult = CefrLevelSchema.safeParse(primaryLanguage?.currentCefrLevel);
  const level = levelResult.success ? levelResult.data : null;
  const isAssessed = level !== null;

  const cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
  const nextLevel = level ? cefrOrder[Math.min(cefrOrder.indexOf(level) + 1, cefrOrder.length - 1)] : null;

  return (
    <div className={stackStyles.stack}>
      <StepProgress currentStepNumber={5} totalSteps={7} label="Level result" />
      <div>
        <p className={styles.label}>Your starting point</p>
        <h1 className={styles.heading}>
          {isAssessed ? `You're ${level} — ${CEFR_LABELS[level]}` : "Your level has not been assessed yet."}
        </h1>
        <p className={styles.description}>
          {isAssessed
            ? `This is an estimated CEFR level from a short CEFR-aligned check, not a certified evaluation${
                language ? ` of your ${language.name}` : ""
              } — it gives us a reasonable starting point for your plan.`
            : `We don't have a CEFR-aligned placement bank for ${
                language?.name ?? "this language"
              } yet, so we couldn't estimate a level. You can continue — we'll let you take a real placement test as soon as one is available for this language.`}
        </p>
      </div>
      {isAssessed && (
        <div className={styles.highlightCard}>
          <p className={styles.levelProgression}>
            {level} → {nextLevel}
          </p>
          {attempt && attempt.categoryResults.length > 0 && (
            <>
              <p className={styles.focusLabel}>Estimated focus</p>
              <div className={styles.categoryGrid}>
                {attempt.categoryResults.map((result) => (
                  <p key={result.category} className={styles.categoryRow}>
                    {result.category} {result.percentage}%
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <form action={advanceFromResultAction}>
        <Button type="submit" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
