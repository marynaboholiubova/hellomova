import { SignupForm } from "@/features/auth/components/SignupForm";
import styles from "./page.module.css";

export default function SignupPage() {
  return (
    <div>
      <h1 className={styles.heading}>Sign up</h1>
      <SignupForm />
    </div>
  );
}
