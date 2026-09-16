"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/features/auth/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import styles from "./AuthForm.module.css";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined);

  return (
    <form action={action} className={styles.form}>
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
        autoComplete="new-password"
        required
        error={state?.errors?.password?.[0]}
      />
      {state?.message && (
        <p className={styles.formMessage} role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} fullWidth>
        {pending ? "Creating account..." : "Sign up"}
      </Button>
      <p className={styles.altAction}>
        Already have an account? <Link href={ROUTES.login}>Log in</Link>
      </p>
    </form>
  );
}
