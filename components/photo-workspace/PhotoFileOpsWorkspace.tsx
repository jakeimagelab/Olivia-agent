"use client";

import dynamic from "next/dynamic";
import { PencilLine, Scaling } from "lucide-react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import type { PhotoFileOpsMode } from "./types";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./PhotoWorkspace.module.css";

const PhotoResizeWorkspace = dynamic(() => import("./PhotoResizeWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>사진 리사이즈 도구를 불러오는 중...</div>,
});
const PhotoRenameWorkspace = dynamic(() => import("./PhotoRenameWorkspace"), {
  ssr: false,
  loading: () => <div className={styles.workspaceLoading}>이름변경 도구를 불러오는 중...</div>,
});

const FILE_OPS_TABS = [
  { mode: "resize", label: "사진 리사이즈", icon: Scaling },
  { mode: "rename", label: "이름변경", icon: PencilLine },
] as const;

export default function PhotoFileOpsWorkspace({ value, onChange }: {
  value: PhotoFileOpsMode;
  onChange: (mode: PhotoFileOpsMode) => void;
}) {
  const { currentLocalFolder } = usePhotoStudioExecution();
  return (
    <div>
      <SegmentedTabs
        ariaLabel="파일 정리 방식"
        value={value}
        onChange={onChange}
        items={FILE_OPS_TABS.map(({ mode, label, icon: Icon }) => ({
          value: mode,
          label,
          icon: <Icon size={17} strokeWidth={1.8} aria-hidden="true" />,
        }))}
      />
      <div role="tabpanel" id={`photo-file-ops-panel-${value}`}>
        {value === "resize" ? <PhotoResizeWorkspace /> : null}
        {value === "rename" ? <PhotoRenameWorkspace rootDir={currentLocalFolder} /> : null}
      </div>
    </div>
  );
}
