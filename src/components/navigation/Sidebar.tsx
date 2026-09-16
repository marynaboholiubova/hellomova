import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [{ href: ROUTES.dashboard, label: "Dashboard" }];

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>HelloMova</div>
      <nav className={styles.nav} aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={styles.navItem}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.footer}>
        <LogoutButton />
      </div>
    </aside>
  );
}
