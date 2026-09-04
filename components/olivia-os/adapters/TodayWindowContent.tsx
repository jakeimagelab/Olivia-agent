"use client";

import { DesktopWidgets } from "../DesktopWidgets";
import styles from "./TodayWindowContent.module.css";

export function TodayWindowContent() {
  return <div className={styles.root}><DesktopWidgets windowMode /></div>;
}
