export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  languageBrain: "/dashboard/language-brain",
  onboardingNativeLanguage: "/onboarding/native-language",
  onboardingTargetLanguage: "/onboarding/target-language",
  onboardingGoal: "/onboarding/goal",
  onboardingPlacementTest: "/onboarding/placement-test",
  onboardingResult: "/onboarding/result",
  onboardingPersonalPlan: "/onboarding/personal-plan",
  onboardingTeacher: "/onboarding/teacher",
} as const;

/** Routes that require an authenticated session. Matched by prefix. */
export const PROTECTED_ROUTE_PREFIXES = [ROUTES.dashboard, "/onboarding"];

/** Routes an already-authenticated user should be redirected away from. */
export const AUTH_ONLY_ROUTES: string[] = [ROUTES.login, ROUTES.signup];
