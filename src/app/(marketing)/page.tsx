import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/constants/routes";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <Container width="lg">
      <section className={styles.hero}>
        <h1 className={styles.heading}>Learn languages the AI way.</h1>
        <p className={styles.subheading}>
          HelloMova pairs AI language teachers with real conversation
          practice, pronunciation coaching, and CEFR progress tracking. This
          foundation release focuses on a secure account and dashboard —
          lessons are coming soon.
        </p>
        <div className={styles.actions}>
          <Link href={ROUTES.signup}>
            <Button>Get started</Button>
          </Link>
          <Link href={ROUTES.login}>
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>
      </section>
    </Container>
  );
}
