"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FolderTree, Images, Scaling } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import type { PhotoWorkspaceMode } from "./types";
import styles from "./PhotoWorkspaceTabs.module.css";

const WORKSPACES: Array<{
  mode: PhotoWorkspaceMode;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  { mode: "select", title: "사진 셀렉", description: "원하는 사진을 빠르게 선택합니다.", icon: <Images size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "metadata-select", title: "메타데이터 셀렉", description: "촬영 시간·EXIF 정보로 사진을 매칭합니다.", icon: <AppIcon name="metadata-select" size={15} aria-hidden="true" /> },
  { mode: "raw-match", title: "AI 컷 정리 / RAW 매칭", description: "AI로 컷을 정리하거나 선택한 JPG를 RAW 원본과 연결합니다.", icon: <AppIcon name="raw-select" size={15} aria-hidden="true" /> },
  { mode: "classification", title: "사진 분류", description: "촬영 사진을 Scene과 유형 기준으로 자동 분류합니다.", icon: <FolderTree size={15} strokeWidth={2} aria-hidden="true" /> },
  { mode: "retouch", title: "사진 보정", description: "색감·톤 보정 작업을 처리합니다.", icon: <AppIcon name="retouch" size={15} aria-hidden="true" /> },
];

// OLIVIA OS Desktop UI 제안서 3단계 — 1차 작업 6단계에서 이 파일에 직접 구현했던 세그먼트
// 컨트롤을 components/ui/SegmentedTabs로 뽑아서 재사용한다(원본 스타일은 그대로).
// 2026-09-10 수정 지시서 2번 — 파일 변환 탭 삭제, 메타데이터 셀렉/사진 보정 탭 추가,
// RAW 매칭을 "AI 컷 정리 / RAW 매칭"으로 통합.
export default function PhotoWorkspaceTabs({
  value,
  onChange,
}: {
  value: PhotoWorkspaceMode;
  onChange: (mode: PhotoWorkspaceMode) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const fullWidthRef = useRef(0);
  const [iconsOnly, setIconsOnly] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    const tabList = shell?.querySelector<HTMLElement>('[role="tablist"]');
    if (!shell || !tabList) return;

    const measure = () => {
      if (!iconsOnly) {
        fullWidthRef.current = Math.max(fullWidthRef.current, tabList.scrollWidth);
        if (tabList.scrollWidth > shell.clientWidth) setIconsOnly(true);
        return;
      }
      if (shell.clientWidth >= fullWidthRef.current) setIconsOnly(false);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(tabList);
    return () => observer.disconnect();
  }, [iconsOnly]);

  return (
    <div ref={shellRef} className={styles.shell} data-icons-only={iconsOnly}>
      <SegmentedTabs
        ariaLabel="사진 작업 선택"
        value={value}
        onChange={onChange}
        items={WORKSPACES.map(({ mode, title, description, icon }) => ({
          value: mode,
          label: title,
          title: description,
          id: `photo-workspace-tab-${mode}`,
          panelId: `photo-workspace-panel-${mode}`,
          icon,
        }))}
      />
    </div>
  );
}
