"use client";

import type { ReactNode } from "react";
import { FolderInput, FolderTree, Images, Link2, Lock, Palette, Wrench } from "lucide-react";
import { WorkspaceTabs } from "@/components/workspace-shell/WorkspaceTabs";
import type { PhotoWorkspaceMode } from "./types";

export const PHOTO_WORKSPACE_TABS: Array<{
  mode: PhotoWorkspaceMode;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  { mode: "jpg-prep", title: "JPG정리", description: "RAW는 그대로 두고 JPG만 JPG전체로 모읍니다.", icon: <FolderInput size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "select", title: "사진 셀렉", description: "원하는 사진을 빠르게 선택합니다.", icon: <Images size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "raw-match", title: "RAW 매칭", description: "선택된 JPG와 대응하는 RAW 원본을 매칭합니다.", icon: <Link2 size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "classification", title: "사진 분류", description: "촬영 사진을 Scene과 유형 기준으로 자동 분류합니다.", icon: <FolderTree size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "file-ops", title: "파일 정리", description: "사진 리사이즈와 이름변경을 한곳에서 처리합니다.", icon: <Wrench size={15} strokeWidth={2} aria-hidden="true" /> },
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
        const unavailable = remote && !["jpg-prep", "select", "classification"].includes(mode);
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
