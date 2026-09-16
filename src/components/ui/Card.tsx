import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={[styles.card, className ?? ""].filter(Boolean).join(" ")} {...props} />
  );
}
