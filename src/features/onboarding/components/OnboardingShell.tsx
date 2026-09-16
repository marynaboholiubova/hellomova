import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import styles from "./OnboardingShell.module.css";

export interface OnboardingShellProps {
  children: ReactNode;
}

/**
 * Matches design-references/onboarding: the interior onboarding screens
 * show no brand header, just the progress bar directly above the step's
 * own heading.
 */
export function OnboardingShell({ children }: OnboardingShellProps) {
  return (
    <div className={styles.page}>
      <Container width="sm">{children}</Container>
    </div>
  );
}
