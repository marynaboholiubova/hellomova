import { redirect } from "next/navigation";
import { getOnboardingProfile } from "@/lib/onboarding/dal";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { ROUTES } from "@/constants/routes";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getOnboardingProfile();

  if (profile.onboardingCompletedAt) {
    redirect(ROUTES.dashboard);
  }

  return <OnboardingShell>{children}</OnboardingShell>;
}
