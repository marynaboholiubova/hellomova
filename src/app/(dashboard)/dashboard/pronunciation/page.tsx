import { redirect } from "next/navigation";
import { getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getLanguageByCode } from "@/constants/languages";
import { ROUTES } from "@/constants/routes";
import { PronunciationPractice } from "@/features/pronunciation/components/PronunciationPractice";

export default async function PronunciationPage() {
  const primaryLanguage = await getPrimaryUserLanguage();

  if (!primaryLanguage) {
    redirect(ROUTES.dashboard);
  }

  const targetLanguage = getLanguageByCode(primaryLanguage.targetLanguageCode);

  return <PronunciationPractice targetLanguageName={targetLanguage?.name ?? primaryLanguage.targetLanguageCode} />;
}
