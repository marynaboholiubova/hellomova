import { verifySession } from "@/lib/auth/dal";
import { getOnboardingProfile, getPrimaryUserLanguage } from "@/lib/onboarding/dal";
import { DashboardHome } from "@/features/dashboard/components/DashboardHome";
import { getLanguageByCode } from "@/constants/languages";
import { getGoalByCode } from "@/constants/goals";
import { getTeacherById } from "@/constants/teachers";

export default async function DashboardPage() {
  const { user } = await verifySession();
  const profile = await getOnboardingProfile();
  const primaryLanguage = await getPrimaryUserLanguage();

  const targetLanguage = primaryLanguage
    ? getLanguageByCode(primaryLanguage.targetLanguageCode)
    : null;
  const goal = profile.learningGoal ? getGoalByCode(profile.learningGoal) : null;
  const teacher = profile.selectedTeacherId ? getTeacherById(profile.selectedTeacherId) : null;

  return (
    <DashboardHome
      displayName={profile.displayName}
      email={user.email ?? null}
      targetLanguageName={targetLanguage?.name ?? null}
      cefrLevel={primaryLanguage?.currentCefrLevel ?? null}
      goalLabel={goal?.label ?? null}
      teacherName={teacher?.name ?? null}
    />
  );
}
