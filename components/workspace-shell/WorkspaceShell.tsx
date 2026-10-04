import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export function WorkspaceShell({ children, className = "", ...props }: ComponentPropsWithoutRef<"div"> & { children: ReactNode }) {
  return <div className={`${styles.page} ${className}`} {...props}>{children}</div>;
}

export function WorkspaceContent({ children, className = "", ...props }: ComponentPropsWithoutRef<"main"> & { children: ReactNode }) {
  return <main className={`${styles.content} ${className}`} {...props}>{children}</main>;
}
