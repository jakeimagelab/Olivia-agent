"use client";

import type { ReactNode } from "react";
import { FolderTree, Images, Link2, Lock, Palette, PencilLine, Scaling, Scissors } from "lucide-react";
import { WorkspaceTabs } from "@/components/workspace-shell/WorkspaceTabs";
import type { PhotoWorkspaceMode } from "./types";

export const PHOTO_WORKSPACE_TABS: Array<{
  mode: PhotoWorkspaceMode;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  { mode: "plan", title: "기획", description: "촬영 콘티를 준비합니다.", icon: <PencilLine size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "select", title: "사진 셀렉", description: "원하는 사진을 빠르게 선택합니다.", icon: <Images size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "raw-match", title: "RAW 매칭", description: "선택된 JPG와 대응하는 RAW 원본을 매칭합니다.", icon: <Link2 size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "classification", title: "사진 분류", description: "촬영 사진을 Scene과 유형 기준으로 자동 분류합니다.", icon: <FolderTree size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "t-cut", title: "T컷 정리", description: "JPG 실패컷 후보를 확인한 뒤 Trash_JPG로 옮깁니다.", icon: <Scissors size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "resize", title: "사진 리사이즈", description: "폴더 전체 사진을 지정한 해상도·품질로 일괄 변환합니다.", icon: <Scaling size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "rename", title: "이름변경", description: "원본 바이트를 검증한 뒤 사진 파일명을 안전하게 변경합니다.", icon: <PencilLine size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "retouch", title: "사진 보정", description: "색감·톤 보정 작업을 처리합니다.", icon: <Palette size={15} strokeWidth={2} aria-hidden="true" /> },
];

// OLIVIA OS Desktop UI 제안서 3단계 — 1차 작업 6단계에서 이 파일에 직접 구현했던 세그먼트
// 컨트롤을 components/ui/SegmentedTabs로 뽑아서 재사용한다(원본 스타일은 그대로).
// 사진 작업의 역할은 상단 독립 탭으로 분리한다. RAW 매칭의 파일명/촬영시간 방식만
// 같은 RAW 매칭 탭 안의 보조 선택지로 제공한다.
export default function PhotoWorkspaceTabs({
  value,
  onChange,
  remote = false,
}: {
  value: PhotoWorkspaceMode;
  onChange: (mode: PhotoWorkspaceMode) => void;
  remote?: boolean;
}) {
  return (
    <WorkspaceTabs
      ariaLabel="사진 작업 선택"
      value={value}
      onChange={onChange}
      items={PHOTO_WORKSPACE_TABS.map(({ mode, title, description, icon }) => {
        const unavailable = remote && !["plan", "select", "classification"].includes(mode);
        return {
          value: mode,
          label: title,
          title: unavailable ? "원격 작업에서는 사용할 수 없습니다" : description,
          id: `photo-workspace-tab-${mode}`,
          panelId: `photo-workspace-panel-${mode}`,
          icon,
          unavailable,
          trailingIcon: unavailable ? <Lock size={12} strokeWidth={2} aria-hidden="true" /> : undefined,
        };
      })}
    />
  );
}
