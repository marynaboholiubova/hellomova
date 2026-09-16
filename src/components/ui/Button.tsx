import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classNames} {...props} />;
}
