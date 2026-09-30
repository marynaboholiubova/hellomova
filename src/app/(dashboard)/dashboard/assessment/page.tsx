import { redirect } from "next/navigation";
import { getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getUserLanguageLevels, getCefrSkillProfile, getAssessmentHistory, getBridgePlans } from "@/lib/assessment/dal";
import { getLanguageByCode } from "@/constants/languages";
import { ROUTES } from "@/constants/routes";
import { AssessmentView } from "@/features/assessment/components/AssessmentView";

export default async function AssessmentPage() {
  const primaryLanguage = await getPrimaryUserLanguage();

  if (!primaryLanguage) {
    redirect(ROUTES.dashboard);
  }

  const [levels, skillProfile, history, bridgePlans] = await Promise.all([
    getUserLanguageLevels(primaryLanguage.targetLanguageCode),
    getCefrSkillProfile(primaryLanguage.targetLanguageCode),
    getAssessmentHistory(primaryLanguage.targetLanguageCode),
    getBridgePlans(primaryLanguage.targetLanguageCode),
  ]);

  const targetLanguage = getLanguageByCode(primaryLanguage.targetLanguageCode);

  return (
    <AssessmentView
      targetLanguageName={targetLanguage?.name ?? primaryLanguage.targetLanguageCode}
      levels={
        levels ?? {
          currentCefrLevel: primaryLanguage.currentCefrLevel,
          confirmedCefrLevel: null,
          learningCefrLevel: primaryLanguage.currentCefrLevel,
          assessmentStatus: primaryLanguage.currentCefrLevel ? "estimated" : "unassessed",
        }
      }
      skillProfile={skillProfile}
      history={history}
      bridgePlans={bridgePlans}
    />
  );
}
