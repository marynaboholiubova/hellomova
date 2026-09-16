import { redirect } from "next/navigation";
import { getOnboardingProfile, onboardingRouteFor } from "@/lib/onboarding/dal";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getOnboardingProfile();

  if (!profile.onboardingCompletedAt) {
    redirect(onboardingRouteFor(profile.onboardingStep));
  }

  return <AppShell>{children}</AppShell>;
}
