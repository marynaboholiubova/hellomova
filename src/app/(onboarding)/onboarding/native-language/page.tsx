import { requireOnboardingStep } from "@/lib/onboarding/dal";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { NativeLanguageForm } from "@/features/onboarding/components/NativeLanguageForm";
import { LANGUAGES } from "@/constants/languages";
import styles from "@/features/onboarding/components/OnboardingPage.module.css";

export default async function NativeLanguagePage() {
  const profile = await requireOnboardingStep("native-language");

  return (
    <div className={styles.stack}>
      <StepProgress currentStepNumber={1} totalSteps={7} label="Native language" />
      <div>
        <h1 className={styles.heading}>What is your native language?</h1>
        <p className={styles.description}>We&apos;ll use it for explanations and translations.</p>
      </div>
      <NativeLanguageForm languages={LANGUAGES} defaultValue={profile.nativeLanguageCode} />
    </div>
  );
}
