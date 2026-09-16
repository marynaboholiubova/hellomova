import { getPrimaryUserLanguage, requireOnboardingStep } from "@/lib/onboarding/dal";
import { skipPlacementTestAction } from "@/features/onboarding/actions";
import { StepProgress } from "@/features/onboarding/components/StepProgress";
import { PlacementTestForm } from "@/features/onboarding/components/PlacementTestForm";
import { Button } from "@/components/ui/Button";
import { getPlacementBank, toPublicQuestion } from "@/lib/placement/questions";
import { getPlacementUiStrings } from "@/lib/placement/uiStrings";
import { getLanguageByCode } from "@/constants/languages";
import styles from "@/features/onboarding/components/OnboardingPage.module.css";

export default async function PlacementTestPage() {
  const profile = await requireOnboardingStep("placement-test");
  const primaryLanguage = await getPrimaryUserLanguage();
  const uiStrings = getPlacementUiStrings(profile.nativeLanguageCode);

  // The target language — never the native language — decides what's
  // tested. If there's no CEFR-aligned bank for it yet, this must never
  // silently fall back to testing in a different language, and must
  // never invent a level either.
  const bank = primaryLanguage ? getPlacementBank(primaryLanguage.targetLanguageCode) : null;

  if (!bank) {
    const languageName = primaryLanguage
      ? getLanguageByCode(primaryLanguage.targetLanguageCode)?.name ?? primaryLanguage.targetLanguageCode
      : "this language";

    return (
      <div className={styles.stack}>
        <StepProgress currentStepNumber={4} totalSteps={7} label="Placement test" />
        <div>
          <h1 className={styles.heading}>{uiStrings.notAvailableHeading}</h1>
          <p className={styles.description}>{uiStrings.notAvailableMessage(languageName)}</p>
        </div>
        <form action={skipPlacementTestAction}>
          <Button type="submit" fullWidth>
            {uiStrings.continueButton}
          </Button>
        </form>
      </div>
    );
  }

  const publicQuestions = bank.map(toPublicQuestion);

  return (
    <div className={styles.stack}>
      <StepProgress currentStepNumber={4} totalSteps={7} label="Placement test" />
      <div>
        <h1 className={styles.heading}>{uiStrings.heading}</h1>
        <p className={styles.description}>{uiStrings.description}</p>
      </div>
      <PlacementTestForm questions={publicQuestions} uiStrings={uiStrings} />
    </div>
  );
}
