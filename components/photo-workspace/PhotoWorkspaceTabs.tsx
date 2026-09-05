import type { LucideIcon } from "lucide-react";
import { FileOutput, FolderTree, Images, Link2 } from "lucide-react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import type { PhotoWorkspaceMode } from "./types";

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

// OLIVIA OS Desktop UI 제안서 3단계 — 1차 작업 6단계에서 이 파일에 직접 구현했던 세그먼트
// 컨트롤을 components/ui/SegmentedTabs로 뽑아서 재사용한다(원본 스타일은 그대로).
export default function PhotoWorkspaceTabs({
  value,
  onChange,
}: {
  value: PhotoWorkspaceMode;
  onChange: (mode: PhotoWorkspaceMode) => void;
}) {
  return (
    <SegmentedTabs
      ariaLabel="사진 작업 선택"
      value={value}
      onChange={onChange}
      items={WORKSPACES.map(({ mode, title, description, icon: Icon }) => ({
        value: mode,
        label: title,
        title: description,
        id: `photo-workspace-tab-${mode}`,
        panelId: `photo-workspace-panel-${mode}`,
        icon: <Icon size={15} strokeWidth={2} aria-hidden="true" />,
      }))}
      style={{ marginBottom: 18 }}
    />
  );
}
