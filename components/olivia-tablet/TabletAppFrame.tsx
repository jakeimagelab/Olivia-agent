"use client";

import type { ReactNode } from "react";
import styles from "./OliviaTabletShell.module.css";

export default function TabletAppFrame({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`${styles.tabletAppFrame} ${compact ? styles.tabletAppFrameCompact : ""}`}
      data-tablet-app-frame
    >
      {children}
    </section>
  );
}
