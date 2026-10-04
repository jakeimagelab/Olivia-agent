"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export type WorkspaceSubTab<T extends string> = { value: T; label: string; icon?: ReactNode; href?: string; title?: string };

export function WorkspaceSubTabs<T extends string>({ items, value, onChange, ariaLabel, tone = "light" }: {
  items: WorkspaceSubTab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: "dark" | "light";
}) {
  return (
    <div className={styles.subTabs} data-tone={tone} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const common = {
          role: "tab",
          "aria-selected": value === item.value,
          title: item.title,
          className: styles.subTab,
        } as const;
        return item.href ? (
          <Link key={item.value} href={item.href} {...common}>{item.icon}{item.label}</Link>
        ) : (
          <button key={item.value} type="button" {...common} onClick={() => onChange(item.value)}>{item.icon}{item.label}</button>
        );
      })}
    </div>
  );
}
