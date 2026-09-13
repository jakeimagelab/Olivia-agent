"use client";

import type { ReactNode } from "react";
import styles from "./OliviaTabletShell.module.css";

export default function TabletAppFrame({
  children,
  compact = false,
  scroll = "contained",
}: {
  children: ReactNode;
  compact?: boolean;
  scroll?: "contained" | "page";
}) {
  return (
    <section
      className={`${styles.tabletAppFrame} ${compact ? styles.tabletAppFrameCompact : ""} ${scroll === "page" ? styles.tabletAppFramePage : ""}`}
      data-tablet-app-frame
      data-tablet-scroll-owner={scroll}
    >
      {children}
    </section>
  );
}
