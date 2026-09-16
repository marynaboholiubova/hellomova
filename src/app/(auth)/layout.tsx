import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ROUTES } from "@/constants/routes";
import styles from "./layout.module.css";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <Link href={ROUTES.home} className={styles.brand}>
        HelloMova
      </Link>
      <Card className={styles.card}>{children}</Card>
    </div>
  );
}
