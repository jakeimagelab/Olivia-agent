"use client";

import {
  Check,
  Images,
  Link2,
  PencilLine,
  Scaling,
  ScanSearch,
  Scissors,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { memo } from "react";

import type {
  PhotoFileOpsMode,
  PhotoSelectMode,
  PhotoWorkspaceMode,
} from "@/components/photo-workspace/types";
import styles from "./OliviaBridgeWorkspace.module.css";

export type BridgeToolKey = "jpg-prep" | "select" | "raw-match" | "classification" | "tcut" | "resize" | "rename" | "retouch";

export type BridgeToolItem = {
  key: BridgeToolKey;
  label: string;
  icon: LucideIcon;
  mode: PhotoWorkspaceMode;
  selectMode?: PhotoSelectMode;
  fileOpsMode?: PhotoFileOpsMode;
};

export const BRIDGE_TOOL_ITEMS: BridgeToolItem[] = [
  { key: "jpg-prep", label: "JPG 정리", icon: Images, mode: "jpg-prep" },
  { key: "select", label: "사진 셀렉", icon: Check, mode: "select", selectMode: "manual" },
  { key: "raw-match", label: "RAW 매칭", icon: Link2, mode: "raw-match" },
  { key: "tcut", label: "T컷 정리", icon: Scissors, mode: "select", selectMode: "tcut" },
  { key: "resize", label: "리사이즈", icon: Scaling, mode: "file-ops", fileOpsMode: "resize" },
  { key: "rename", label: "이름변경", icon: PencilLine, mode: "file-ops", fileOpsMode: "rename" },
  { key: "retouch", label: "사진 보정", icon: WandSparkles, mode: "retouch" },
  { key: "classification", label: "사진 분류", icon: ScanSearch, mode: "classification" },
];

export const OliviaBridgeActionBar = memo(function OliviaBridgeActionBar({
  selectedCount,
  labeledCount,
  excludedCount,
  activeToolKey,
  sceneReviewOpen,
  disabledReasonFor,
  onOpenTool,
  hasActiveFolder,
  scanReady,
  onOpenGallerySelection,
  onOpenPersonSelection,
  activeRatingFilterName,
  activeColorFilterName,
  unreadableFolderCount,
  ignoredCount,
}: {
  selectedCount: number;
  labeledCount: number;
  excludedCount: number;
  activeToolKey?: BridgeToolKey;
  sceneReviewOpen: boolean;
  disabledReasonFor: (key: BridgeToolKey) => string | undefined;
  onOpenTool: (key: BridgeToolKey) => void;
  hasActiveFolder: boolean;
  scanReady: boolean;
  onOpenGallerySelection: () => void;
  onOpenPersonSelection: () => void;
  activeRatingFilterName: string | null;
  activeColorFilterName: string | null;
  unreadableFolderCount: number;
  ignoredCount: number;
}) {
  const customerImportDisabled = !hasActiveFolder || !scanReady;

  return <>
    <section className={styles.actionBar} aria-label="Bridge 작업 도구">
      <div className={styles.actionSummary}><span>선택 <b>{selectedCount}</b></span><span>레이블 <b>{labeledCount}</b></span><span>제외 <b>{excludedCount}</b></span></div>
      <nav className={styles.actionTools}>
        {BRIDGE_TOOL_ITEMS.map(({ key, label, icon: Icon }) => {
          const disabledReason = disabledReasonFor(key);
          return <button key={key} type="button" data-primary={key === "classification" ? "true" : "false"} data-active={activeToolKey === key || (key === "classification" && sceneReviewOpen) ? "true" : "false"} onClick={() => onOpenTool(key)} disabled={Boolean(disabledReason)} aria-label={disabledReason ? `${label}: ${disabledReason}` : label} title={disabledReason ?? label}><Icon size={12} strokeWidth={1.8} /><span>{label}</span>{disabledReason ? <small>{disabledReason}</small> : null}</button>;
        })}
        <button type="button" className={styles.customerSelectionButton} onClick={onOpenGallerySelection} disabled={customerImportDisabled} aria-label={customerImportDisabled ? "갤러리 고객 셀렉: 사진 폴더를 먼저 선택해 주세요." : "갤러리 고객 셀렉 불러오기"} title={customerImportDisabled ? "사진 폴더를 먼저 선택해 주세요." : "사진선택 갤러리에 제출된 고객 셀렉을 비교합니다."}><Users size={12} strokeWidth={1.8} /><span>갤러리 고객 셀렉</span></button>
        <button type="button" className={styles.customerSelectionButton} onClick={onOpenPersonSelection} disabled={customerImportDisabled} aria-label={customerImportDisabled ? "고객 선택 불러오기: 사진 폴더를 먼저 선택해 주세요." : "개인별 사진선택 행사 불러오기"} title={customerImportDisabled ? "사진 폴더를 먼저 선택해 주세요." : "개인별 사진 셀렉 행사에서 고객이 고른 사진을 불러옵니다."}><Users size={12} strokeWidth={1.8} /><span>고객 선택 불러오기</span></button>
      </nav>
    </section>

    <footer className={styles.shortcutBar}>
      <div className={styles.shortcutHints}>{activeRatingFilterName ? <b className={styles.shortcutActiveFilter}>{activeRatingFilterName}</b> : null}{activeColorFilterName ? <b className={styles.shortcutActiveFilter}>{activeColorFilterName}</b> : null}<span>드래그 영역 선택</span><span>⌘/Ctrl 클릭 추가 선택</span><span>Shift+←↑↓→ 범위 선택</span><span>⌘/Ctrl+A 전체 선택</span><span>⌘/Ctrl+B 선택 리뷰</span><span>← ↑ ↓ → 사진 이동</span><span>Space OS 창 미리보기</span><span>1–5 별점 · 0 해제</span><span>6–9 컬러 · 같은 키 해제</span><span>⌥⌘숫자 필터 · ⌥⌘A 전체 · ⌘F 검색</span><span>X 제외</span>{unreadableFolderCount ? <i>하위 폴더 {unreadableFolderCount}곳을 읽지 못함</i> : null}{ignoredCount ? <i>숨김·기타 {ignoredCount}개 제외</i> : null}</div>
    </footer>
  </>;
});
