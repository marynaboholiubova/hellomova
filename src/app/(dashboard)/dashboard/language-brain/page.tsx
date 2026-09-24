import { redirect } from "next/navigation";
import { getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getLanguageBrainSummary } from "@/lib/languageBrain/dal";
import { getLanguageByCode } from "@/constants/languages";
import { ROUTES } from "@/constants/routes";
import { LanguageBrainView } from "@/features/languageBrain/components/LanguageBrainView";

export default async function LanguageBrainPage() {
  const primaryLanguage = await getPrimaryUserLanguage();

  if (!primaryLanguage) {
    redirect(ROUTES.dashboard);
  }

  const summary = await getLanguageBrainSummary(primaryLanguage.targetLanguageCode);
  const targetLanguage = getLanguageByCode(primaryLanguage.targetLanguageCode);

  return (
    <LanguageBrainView
      targetLanguageName={targetLanguage?.name ?? primaryLanguage.targetLanguageCode}
      summary={summary}
    />
  );
}
