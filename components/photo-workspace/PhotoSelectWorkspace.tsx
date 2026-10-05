"use client";

import dynamic from "next/dynamic";
import { MousePointer2, Sparkles, Users } from "lucide-react";
import AiPhotoSelectPanel from "./AiPhotoSelectPanel";
import type { PhotoSelectMode } from "./types";
import styles from "./PhotoWorkspace.module.css";
import { WorkspaceSubTabs } from "@/components/workspace-shell/WorkspaceSubTabs";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";

const SelectMatchWorkspace = dynamic(() => import("./SelectMatchWorkspace").then((module) => module.SelectMatchWorkspace), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 셀렉 도구를 불러오는 중...</div>,
});
const RemotePhotoSelectWorkspace = dynamic(() => import("./RemotePhotoSelectWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>원격 사진 셀렉을 준비하는 중...</div>,
});

const SELECT_TABS = [
  { mode: "ai", label: "AI 사진 셀렉", icon: Sparkles },
  { mode: "manual", label: "직접 셀렉", icon: MousePointer2 },
  { mode: "client", label: "고객 선택 불러오기", icon: Users },
] as const;

export default function PhotoSelectWorkspace({ value, onChange, onStartRawMatch, remote = false }: {
  value: PhotoSelectMode;
  onChange: (mode: PhotoSelectMode) => void;
  onStartRawMatch: () => void;
  remote?: boolean;
}) {
  const { setCurrentLocalFolder, setSelectedJpgNames } = usePhotoStudioExecution();
  if (remote) return <RemotePhotoSelectWorkspace />;

  return (
    <div>
      <WorkspaceSubTabs
        ariaLabel="사진 셀렉 방식"
        tone="dark"
        value={value}
        onChange={onChange}
        items={SELECT_TABS.map(({ mode, label, icon: Icon }) => ({
          value: mode,
          label,
          icon: <Icon size={17} strokeWidth={1.8} aria-hidden="true" />,
        }))}
      />
      <div role="tabpanel" id={`photo-select-panel-${value}`} aria-labelledby={`photo-select-tab-${value}`}>
        {value === "ai" ? <AiPhotoSelectPanel onSelectFolder={setCurrentLocalFolder} onConfirmSelection={setSelectedJpgNames} onStartRawMatch={(names) => { setSelectedJpgNames(names); onStartRawMatch(); }} /> : null}
        {value === "manual" ? <SelectMatchWorkspace embedded initialView="manual" selectionOnly onSelectionComplete={setSelectedJpgNames} /> : null}
        {value === "client" ? <SelectMatchWorkspace embedded initialView="client" selectionOnly onSelectionComplete={setSelectedJpgNames} /> : null}
      </div>
    </div>
  );
}
