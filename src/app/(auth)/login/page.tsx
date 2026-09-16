import { LoginForm } from "@/features/auth/components/LoginForm";
import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div>
      <h1 className={styles.heading}>Log in</h1>
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
