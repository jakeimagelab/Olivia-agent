import type { LucideIcon } from "lucide-react";
import { FileOutput, FolderTree, Images, Link2 } from "lucide-react";
import type { PhotoWorkspaceMode } from "./types";
import styles from "./PhotoWorkspace.module.css";

const WORKSPACES: Array<{
  mode: PhotoWorkspaceMode;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  { mode: "select", title: "사진 셀렉", description: "원하는 사진을 빠르게 선택합니다.", icon: Images },
  { mode: "raw-match", title: "RAW 매칭", description: "선택한 JPG를 RAW 원본과 연결합니다.", icon: Link2 },
  { mode: "classification", title: "사진 분류", description: "촬영 사진을 Scene과 유형 기준으로 자동 분류합니다.", icon: FolderTree },
  { mode: "conversion", title: "파일 변환", description: "파일 형식 변환 및 리사이즈 작업을 처리합니다.", icon: FileOutput },
];

export default function PhotoWorkspaceTabs({
  value,
  onChange,
}: {
  value: PhotoWorkspaceMode;
  onChange: (mode: PhotoWorkspaceMode) => void;
}) {
  return (
    <div className={styles.workspaceTabs} role="tablist" aria-label="사진 작업 선택">
      {WORKSPACES.map(({ mode, title, description, icon: Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            id={`photo-workspace-tab-${mode}`}
            aria-selected={active}
            aria-controls={`photo-workspace-panel-${mode}`}
            className={`${styles.workspaceTab}${active ? ` ${styles.workspaceTabActive}` : ""}`}
            onClick={() => onChange(mode)}
          >
            <span className={styles.workspaceIcon} aria-hidden="true"><Icon size={21} strokeWidth={1.8} /></span>
            <span className={styles.workspaceTabCopy}>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
