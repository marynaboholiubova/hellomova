import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ROUTES } from "@/constants/routes";
import styles from "./layout.module.css";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Container width="xl" className={styles.headerInner}>
          <Link href={ROUTES.home} className={styles.brand}>
            HelloMova
          </Link>
          <nav className={styles.nav} aria-label="Primary">
            <Link href={ROUTES.login}>Log in</Link>
            <Link href={ROUTES.signup} className={styles.ctaLink}>
              Sign up
            </Link>
          </nav>
        </Container>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Container width="xl">
          <p>&copy; {new Date().getFullYear()} HelloMova</p>
        </Container>
      </footer>
    </div>
  );
}
