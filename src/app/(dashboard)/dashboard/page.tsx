import { verifySession } from "@/lib/auth/dal";
import { getOnboardingProfile, getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { getActiveLessonSession } from "@/lib/lessons/dal";
import { getLanguageBrainSummary } from "@/lib/languageBrain/dal";
import { DashboardHome, type DashboardBrainSnapshot } from "@/features/dashboard/components/DashboardHome";
import { getLanguageByCode } from "@/constants/languages";
import { getGoalByCode } from "@/constants/goals";
import { getTeacherById } from "@/constants/teachers";

export default async function DashboardPage() {
  const { user } = await verifySession();
  const profile = await getOnboardingProfile();
  const primaryLanguage = await getPrimaryUserLanguage();
  const activeLesson = await getActiveLessonSession();

  const targetLanguage = primaryLanguage
    ? getLanguageByCode(primaryLanguage.targetLanguageCode)
    : null;
  const goal = profile.learningGoal ? getGoalByCode(profile.learningGoal) : null;
  const teacher = profile.selectedTeacherId ? getTeacherById(profile.selectedTeacherId) : null;

  let languageBrain: DashboardBrainSnapshot | null = null;
  if (primaryLanguage) {
    const summary = await getLanguageBrainSummary(primaryLanguage.targetLanguageCode);
    const topFocusArea = summary.weakAreas[0] ?? null;
    languageBrain = {
      hasAnyEvidence: summary.hasAnyEvidence,
      dueReviewCount: summary.dueReviewCount,
      topFocusAreaLabel: topFocusArea
        ? `${topFocusArea.category.replace(/_/g, " ")}: ${topFocusArea.patternKey.replace(/-/g, " ")}`
        : null,
    };
  }

  return (
    <DashboardHome
      displayName={profile.displayName}
      email={user.email ?? null}
      targetLanguageName={targetLanguage?.name ?? null}
      cefrLevel={primaryLanguage?.currentCefrLevel ?? null}
      goalLabel={goal?.label ?? null}
      teacherName={teacher?.name ?? null}
      canStartLesson={Boolean(primaryLanguage)}
      activeLessonSessionId={activeLesson?.id ?? null}
      languageBrain={languageBrain}
    />
  );
}
