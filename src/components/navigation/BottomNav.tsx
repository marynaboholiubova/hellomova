import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import styles from "./BottomNav.module.css";

const NAV_ITEMS = [{ href: ROUTES.dashboard, label: "Dashboard" }];

export function BottomNav() {
  return (
    <nav className={styles.bottomNav} aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={styles.navItem}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
