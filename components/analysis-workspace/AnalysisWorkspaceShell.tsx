"use client";

import type { ReactNode } from "react";
import AnalysisExecutionBar from "./AnalysisExecutionBar";
import AnalysisWorkspaceHeader from "./AnalysisWorkspaceHeader";
import AnalysisWorkspaceTabs, { type AnalysisWorkspaceTab } from "./AnalysisWorkspaceTabs";
import styles from "./AnalysisWorkspace.module.css";

export type AnalysisWorkspaceSurface = "page" | "window" | "tablet";

export default function AnalysisWorkspaceShell({
  surface = "page",
  title,
  description,
  eyebrow,
  target,
  tabs = [],
  activeTab = "",
  onTabChange = () => undefined,
  children,
}: {
  surface?: AnalysisWorkspaceSurface;
  title: string;
  description: string;
  eyebrow?: string;
  target?: ReactNode;
  tabs?: readonly AnalysisWorkspaceTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell} data-analysis-surface={surface}>
      <AnalysisExecutionBar />
      <div className={styles.viewport}>
        <AnalysisWorkspaceHeader title={title} description={description} eyebrow={eyebrow} target={target} />
        <AnalysisWorkspaceTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
