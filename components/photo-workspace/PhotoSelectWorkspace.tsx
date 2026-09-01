"use client";

import dynamic from "next/dynamic";
import { MousePointer2, Sparkles, Users } from "lucide-react";
import AiPhotoSelectPanel from "./AiPhotoSelectPanel";
import type { PhotoSelectMode } from "./types";
import styles from "./PhotoWorkspace.module.css";

const SelectMatchWorkspace = dynamic(() => import("./SelectMatchWorkspace").then((module) => module.SelectMatchWorkspace), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 셀렉 도구를 불러오는 중...</div>,
});

const SELECT_TABS = [
  { mode: "ai", label: "AI 사진 셀렉", icon: Sparkles },
  { mode: "manual", label: "직접 셀렉", icon: MousePointer2 },
  { mode: "client", label: "고객 선택 불러오기", icon: Users },
] as const;

export default function PhotoSelectWorkspace({ value, onChange, onStartRawMatch }: {
  value: PhotoSelectMode;
  onChange: (mode: PhotoSelectMode) => void;
  onStartRawMatch: () => void;
}) {
  return (
    <div>
      <div className={styles.selectTabs} role="tablist" aria-label="사진 셀렉 방식">
        {SELECT_TABS.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            id={`photo-select-tab-${mode}`}
            aria-selected={value === mode}
            aria-controls={`photo-select-panel-${mode}`}
            className={value === mode ? styles.selectTabActive : undefined}
            onClick={() => onChange(mode)}
          ><Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`photo-select-panel-${value}`} aria-labelledby={`photo-select-tab-${value}`}>
        {value === "ai" ? <AiPhotoSelectPanel onStartRawMatch={onStartRawMatch} /> : null}
        {value === "manual" ? <SelectMatchWorkspace embedded initialView="manual" /> : null}
        {value === "client" ? <SelectMatchWorkspace embedded initialView="client" /> : null}
      </div>
    </div>
  );
}
