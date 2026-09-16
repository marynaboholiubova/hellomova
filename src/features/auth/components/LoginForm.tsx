"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import styles from "./AuthForm.module.css";

export interface LoginFormProps {
  /** Where to send the user after a successful login. Re-validated server-side. */
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className={styles.form}>
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state?.errors?.email?.[0]}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state?.errors?.password?.[0]}
      />
      {state?.message && (
        <p className={styles.formMessage} role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Logging in..." : "Log in"}
      </Button>
      <p className={styles.altAction}>
        Don&apos;t have an account? <Link href={ROUTES.signup}>Sign up</Link>
      </p>
    </form>
  );
}
