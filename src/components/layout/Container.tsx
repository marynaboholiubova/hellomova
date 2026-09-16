import type { HTMLAttributes } from "react";
import styles from "./Container.module.css";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: "sm" | "md" | "lg" | "xl";
}

export function Container({ width = "lg", className, ...props }: ContainerProps) {
  return (
    <div
      className={[styles.container, styles[width], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
