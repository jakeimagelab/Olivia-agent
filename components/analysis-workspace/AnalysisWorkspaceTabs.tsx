"use client";

import type { ReactNode } from "react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import styles from "./AnalysisWorkspace.module.css";

export type AnalysisWorkspaceTab = {
  value: string;
  label: string;
  icon?: ReactNode;
};

export default function AnalysisWorkspaceTabs({ tabs, value, onChange }: {
  tabs: readonly AnalysisWorkspaceTab[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className={styles.tabs}>
      <SegmentedTabs
        ariaLabel="분석 화면 선택"
        value={value}
        onChange={onChange}
        items={tabs.map((tab) => ({
          value: tab.value,
          label: tab.label,
          icon: tab.icon,
        }))}
      />
    </div>
  );
}
