"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  File,
  Images,
  LayoutGrid,
  Maximize2,
  Star,
  X,
} from "lucide-react";
import { memo } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import {
  BridgePreviewImage,
  formatBridgeTimestamp,
  formatBytes,
} from "@/components/olivia-bridge/OliviaBridgeMedia";
import type { BridgeJpgFile, BridgeRawFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  BRIDGE_COLOR_LABELS,
  type BridgeColorLabel,
} from "@/lib/photo-bridge/labels";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import styles from "./OliviaBridgeWorkspace.module.css";

export type OliviaBridgePreviewTab = "selection" | "preview" | "olivia";

type PreviewSize = { width: number; height: number };

export const OliviaBridgePreviewPanel = memo(function OliviaBridgePreviewPanel({
  panelRef,
  previewTab,
  onPreviewTabChange,
  onCloseCompact,
  selectedCount,
  selectionSource,
  lastFocusedName,
  adobeSelectedCount,
  manualSelectedCount,
  focusedPhoto,
  focusedPlainFile,
  customerSelected,
  customerRating,
  customerNote,
  quality,
  selectedRatingMixed,
  commonSelectedRating,
  onApplyRating,
  selectedColorMixed,
  commonSelectedColor,
  onApplyColorLabel,
  onClearColorLabels,
  allSelectedExcluded,
  onToggleExcluded,
  onOpenFullscreen,
  folderPath,
  selectedNamesCount,
  focusedIndex,
  visibleCount,
  onMoveFocus,
  previewSize,
  onPreviewSize,
  focusedRating,
  focusedSelected,
  onToggleFocusedSelection,
}: {
  panelRef: RefObject<HTMLElement | null>;
  previewTab: OliviaBridgePreviewTab;
  onPreviewTabChange: (tab: OliviaBridgePreviewTab) => void;
  onCloseCompact: () => void;
  selectedCount: number;
  selectionSource: BridgeSelectionSource;
  lastFocusedName: string;
  adobeSelectedCount: number;
  manualSelectedCount: number;
  focusedPhoto: BridgeJpgFile | null;
  focusedPlainFile: BridgeRawFile | null;
  customerSelected: boolean;
  customerRating: number;
  customerNote: string;
  quality?: PublicPhotoQualityResult;
  selectedRatingMixed: boolean;
  commonSelectedRating: number | null;
  onApplyRating: (rating: number, focusedOnly?: boolean) => void;
  selectedColorMixed: boolean;
  commonSelectedColor: number | null;
  onApplyColorLabel: (label: BridgeColorLabel, focusedOnly?: boolean) => void;
  onClearColorLabels: () => void;
  allSelectedExcluded: boolean;
  onToggleExcluded: (focusedOnly?: boolean) => void;
  onOpenFullscreen: () => void;
  folderPath: string;
  selectedNamesCount: number;
  focusedIndex: number;
  visibleCount: number;
  onMoveFocus: (delta: number) => void;
  previewSize?: PreviewSize;
  onPreviewSize: Dispatch<SetStateAction<PreviewSize | undefined>>;
  focusedRating: number;
  focusedSelected: boolean;
  onToggleFocusedSelection: () => void;
}) {
  return (
    <aside ref={panelRef} id="olivia-bridge-preview-panel" className={styles.previewPanel} aria-label="선택한 사진 미리보기">
      <header className={styles.previewHeader}>
        <strong>선택한 파일</strong>
        <button type="button" className={styles.compactPreviewClose} onClick={onCloseCompact} aria-label="미리보기 닫기"><X size={15} /></button>
        <LayoutGrid size={15} aria-hidden="true" />
      </header>
      <div className={styles.previewTabs} role="tablist" aria-label="선택한 파일 패널">
        <button type="button" role="tab" aria-selected={previewTab === "selection"} onClick={() => onPreviewTabChange("selection")}>선택한 파일</button>
        <button type="button" role="tab" aria-selected={previewTab === "preview"} onClick={() => onPreviewTabChange("preview")}>미리보기</button>
        <button type="button" role="tab" aria-selected={previewTab === "olivia"} onClick={() => onPreviewTabChange("olivia")}>Olivia</button>
      </div>
      {previewTab === "selection" ? (
        <div className={styles.selectionInspector}>
          <section className={styles.selectionInspectorSummary}>
            <div><strong>{selectedCount}장</strong><span> 선택됨</span></div>
            <small className={styles.selectionSourceLabel}>기준: {selectionSource === "olivia" ? "올리비아" : selectionSource === "adobe" ? "어도비" : "둘 다"}</small>
            <p>마지막으로 고른 것 · {lastFocusedName}</p>
            <div className={styles.selectionSourceCounts}><span>Adobe {adobeSelectedCount}장</span><span>직접 고름 {manualSelectedCount}장</span></div>
            {focusedPhoto && customerSelected ? <div className={styles.customerSelectionFocus}><b>고객 셀렉{customerRating ? ` · ${customerRating}점` : ""}</b>{customerNote ? <span>{customerNote}</span> : null}</div> : null}
            {focusedPhoto && quality ? <div className={styles.aiQualityFocus}><b>AI 품질 분석 · {quality.reviewStatus === "confirmed_normal" ? "정상 확인됨" : quality.reviewStatus === "confirmed_issue" ? "문제 확인됨" : quality.status === "needs_review" ? "확인 필요" : quality.flags.length ? "문제 의심" : "정상"}</b><span>{quality.flags.map((flag) => flag === "eyes_closed" ? "눈감음" : flag === "face_too_dark" ? "얼굴 어두움" : "흔들림").join(" · ") || "감지된 문제 없음"}</span><small>AI 결과는 별점·셀렉·파일을 자동 변경하지 않습니다.</small></div> : null}
          </section>
          <section className={styles.bulkControl} aria-label="선택한 사진 별점">
            <header><span>앱에 별점 적용</span>{selectedRatingMixed ? <b>혼합</b> : <b>{commonSelectedRating ? `${commonSelectedRating}점` : "없음"}</b>}</header>
            <div className={styles.bulkRatingButtons}>{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" disabled={!selectedCount} aria-label={`선택 사진에 ${rating}점 적용`} aria-pressed={!selectedRatingMixed && commonSelectedRating === rating} onClick={() => onApplyRating(rating)}><Star size={17} fill={!selectedRatingMixed && commonSelectedRating === rating ? "currentColor" : "none"} /></button>)}</div>
            <button type="button" className={styles.clearBulkButton} disabled={!selectedCount} onClick={() => onApplyRating(0)}>별점 해제</button>
            <small>Adobe에서 별점을 불러와도 앱에서 편집한 값은 유지됩니다.</small>
          </section>
          <section className={styles.bulkControl} aria-label="선택한 사진 컬러 레이블">
            <header><span>컬러 레이블</span>{selectedColorMixed ? <b>혼합</b> : <b>{commonSelectedColor ? BRIDGE_COLOR_LABELS[commonSelectedColor as BridgeColorLabel].name : "없음"}</b>}</header>
            <div className={styles.bulkColorButtons}>{(Object.entries(BRIDGE_COLOR_LABELS) as Array<[string, { name: string; color: string }]>).map(([label, value]) => <button key={label} type="button" disabled={!selectedCount} aria-label={`${value.name} 레이블`} aria-pressed={!selectedColorMixed && commonSelectedColor === Number(label)} style={{ background: value.color }} onClick={() => onApplyColorLabel(Number(label) as BridgeColorLabel)} />)}<button type="button" className={styles.clearColorButton} disabled={!selectedCount} aria-label="컬러 레이블 해제" onClick={onClearColorLabels}><X size={14} /></button></div>
          </section>
          <div className={styles.selectionInspectorActions}>
            <button type="button" disabled={!selectedCount} onClick={() => onToggleExcluded()}>{allSelectedExcluded ? "선택 파일 제외 해제" : "선택 파일 제외"}</button>
            <button type="button" disabled={!focusedPhoto} onClick={onOpenFullscreen}><Maximize2 size={13} /> 크게 보기</button>
          </div>
        </div>
      ) : previewTab === "olivia" ? (
        <div className={styles.previewOlivia}><div><strong>{folderPath || "폴더 미선택"}</strong><span>{lastFocusedName === "없음" ? "파일 미선택" : lastFocusedName} · 선택 JPG {selectedNamesCount}장</span></div><OliviaChatDockTarget id="olivia-bridge-preview" priority={92} className={styles.previewOliviaDock} /></div>
      ) : focusedPhoto ? <>
        <div className={styles.previewCanvas} onDoubleClick={onOpenFullscreen}><button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => onMoveFocus(-1)} disabled={focusedIndex <= 0} aria-label="이전 사진"><ChevronLeft size={22} /></button><BridgePreviewImage photo={focusedPhoto} onSize={onPreviewSize} /><button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => onMoveFocus(1)} disabled={focusedIndex < 0 || focusedIndex >= visibleCount - 1} aria-label="다음 사진"><ChevronRight size={22} /></button></div>
        <div className={styles.previewMeta}><strong>{focusedPhoto.name}</strong><span>{previewSize ? `${previewSize.width} × ${previewSize.height}` : "크기 확인 중"}</span><i /><span>{formatBytes(focusedPhoto.size)}</span><i /><span>{focusedPhoto.extension}</span>{focusedPhoto.captureTimestamp ? <><i /><span title={focusedPhoto.timestampSource === "mtime" ? "EXIF 촬영시각이 없어 파일 수정시각을 사용했습니다." : "사진 EXIF 메타데이터의 촬영시각입니다."}>{formatBridgeTimestamp(focusedPhoto)}</span></> : null}<div className={styles.previewRatings} aria-label="별점">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`${rating}점`} aria-pressed={focusedRating >= rating} onClick={() => onApplyRating(rating, true)}><Star size={15} fill={focusedRating >= rating ? "currentColor" : "none"} /></button>)}<button type="button" onClick={() => onApplyRating(0, true)}>해제</button></div><button type="button" className={styles.previewSelectButton} onClick={onToggleFocusedSelection}><Check size={13} />{focusedSelected ? "선택됨" : "선택"}</button><button type="button" className={styles.previewExpandButton} onClick={onOpenFullscreen}><Maximize2 size={13} /> 크게 보기</button></div>
      </> : focusedPlainFile ? <div className={styles.previewFileInfo}><File size={42} /><strong>{focusedPlainFile.name}</strong><span>{focusedPlainFile.extension} · {formatBytes(focusedPlainFile.size)}</span><p>RAW와 사이드카는 파일 정보만 표시하며 미리보기를 만들지 않습니다.</p></div> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 파일을 선택해 주세요</strong><span>RAW와 사이드카는 미리보기를 만들지 않습니다.</span></div>}
    </aside>
  );
});
