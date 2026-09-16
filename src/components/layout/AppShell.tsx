import type { ReactNode } from "react";
import { Sidebar } from "@/components/navigation/Sidebar";
import { BottomNav } from "@/components/navigation/BottomNav";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
      <BottomNav />
    </div>
  );
}
