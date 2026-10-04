import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export function WorkPanel({ children, tone = "dark", className = "", ...props }: ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  tone?: "dark" | "light";
}) {
  return <section className={`${styles.workPanel} ${className}`} data-tone={tone} {...props}>{children}</section>;
}
