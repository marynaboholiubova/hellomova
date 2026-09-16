import { getPrimaryUserLanguage, requireOnboardingStep } from "@/lib/onboarding/dal";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { TargetLanguageForm } from "@/features/onboarding/components/TargetLanguageForm";
import { LANGUAGES } from "@/constants/languages";
import styles from "@/features/onboarding/components/OnboardingPage.module.css";

export default async function TargetLanguagePage() {
  await requireOnboardingStep("target-language");
  const primaryLanguage = await getPrimaryUserLanguage();

  return (
    <div className={styles.stack}>
      <StepProgress currentStepNumber={2} totalSteps={7} label="Target language" />
      <div>
        <h1 className={styles.heading}>What do you want to learn?</h1>
        <p className={styles.description}>
          You can add more languages later — this is the one we&apos;ll start with.
        </p>
      </div>
      <TargetLanguageForm
        languages={LANGUAGES}
        defaultValue={primaryLanguage?.targetLanguageCode ?? null}
      />
    </div>
  );
}
