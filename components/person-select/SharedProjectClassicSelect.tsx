"use client";

import { useMemo, useRef, useState } from "react";
import type { CustomerBridgeDraft, CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import {
  type SelectionMediaUrls,
  type SelectionMediaVariant,
} from "@/lib/select-gallery/mediaLoading";
import type { SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import { SharedProjectClassicPhotoCard } from "./SharedProjectClassicPhotoCard";
import { useSharedProjectClassicMedia } from "./useSharedProjectClassicMedia";
import { useSharedProjectClassicSelection } from "./useSharedProjectClassicSelection";
import styles from "./SharedProjectSelect.module.css";

export type SharedProjectEvent = { id: string; title: string; customer_view_mode?: "classic" | "bridge"; customer_stage?: "select" | "delivery"; deadline_at: string; download_available?: boolean; customer_ai_results_visible?: boolean };
export type SharedProjectReviewer = { id: string; display_name: string; role_label?: string | null; can_view_ai_results?: boolean; can_download_jpg?: boolean; can_download_raw?: boolean; can_finalize?: boolean };
export type SharedProjectSelection = { items?: Array<{ image_id: string; customer_rating?: number | null; customer_color_label?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;
export type SharedProjectImageUrls = Record<string, SelectionMediaUrls>;

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `shared_${crypto.randomUUID()}` : `shared_${Date.now()}`;
}

export function SharedProjectClassicSelect({ shareToken, event, reviewer, images: initialImages, totalImageCount, hasMoreImages, imagePageLoading, imagePageError, loadMoreImages, draft, selection, onSubmitted, loadImageUrls }: { shareToken: string; event: SharedProjectEvent; reviewer: SharedProjectReviewer; images: CustomerBridgeImage[]; totalImageCount: number; hasMoreImages: boolean; imagePageLoading: boolean; imagePageError: string; loadMoreImages: () => Promise<boolean>; draft: CustomerBridgeDraft | null; selection: SharedProjectSelection; onSubmitted: () => void; loadImageUrls: (imageIds: string[], options?: { variant: SelectionMediaVariant }) => Promise<SharedProjectImageUrls> }) {
  const seed = draft?.selectedImageIds ?? selection?.items?.map((item) => item.image_id) ?? [];
  const seedRatings = draft?.ratings ?? Object.fromEntries((selection?.items ?? []).filter((item) => item.customer_rating).map((item) => [item.image_id, Number(item.customer_rating)]));
  const seedColors = draft?.colorLabels ?? Object.fromEntries((selection?.items ?? []).filter((item) => item.customer_color_label).map((item) => [item.image_id, Number(item.customer_color_label)]));
  const seedNotes = draft?.imageNotes ?? Object.fromEntries((selection?.items ?? []).filter((item) => item.memo).map((item) => [item.image_id, String(item.memo)]));
  const initialSnapshot: SharedSelectionSyncSnapshot = {
    revision: draft?.revision ?? 0,
    selectedImageIds: seed,
    ratings: seedRatings,
    colorLabels: seedColors,
    imageNotes: seedNotes,
    customerMemo: draft?.customerMemo ?? selection?.customer_memo ?? "",
    updatedAt: draft?.updatedAt ?? null,
  };
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [state, setState] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitKey = useRef(requestKey());
  const { selected, selectionSync, memoSync, toggle, saveState: syncedSaveState } = useSharedProjectClassicSelection({
    shareToken,
    eventId: event.id,
    reviewerId: reviewer.id,
    initialSnapshot,
    onError: setState,
  });
  const { images, renderedImages, sentinelRef } = useSharedProjectClassicMedia({
    initialImages,
    selected,
    filter,
    hasMoreImages,
    imagePageLoading,
    loadMoreImages,
    loadImageUrls,
    onError: setState,
  });

  const openSubmitReview = async () => {
    if (!selected.size || selectionSync.pendingCount || memoSync.pending) return;
    if (!(await selectionSync.flushNow()) || !(await memoSync.flushNow())) { setState("저장 안 된 변경이 있어 제출할 수 없습니다."); return; }
    setSubmitReviewOpen(true);
  };
  const submit = async () => {
    if (!selected.size || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/pick/shared/${shareToken}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: submitKey.current, confirmed: true }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        setState(result.error || "제출 실패");
        return;
      }
      onSubmitted();
    } catch (error) {
      setState(error instanceof Error ? error.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  };
  const saveState = state || syncedSaveState;
  const reviewItems = useMemo(() => {
    if (!submitReviewOpen) return [];
    const items = [];
    for (const image of images) {
      if (!selected.has(image.id)) continue;
      items.push({ id: image.id, fileName: image.original_file_name, thumbnailUrl: image.thumbnail_url || image.image_url, detail: "공동 셀렉" });
      if (items.length === 12) break;
    }
    return items;
  }, [images, selected, submitReviewOpen]);

  return <main className={styles.shell}><header className={styles.header}><div><h1>{event.title}</h1><p>마감 {new Date(event.deadline_at).toLocaleString("ko-KR")}</p></div><strong>{selected.size} / {totalImageCount}장 선택</strong></header><nav className={styles.toolbar}><button type="button" className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>전체 사진</button><button type="button" className={filter === "selected" ? styles.active : ""} onClick={() => setFilter("selected")}>선택한 사진</button></nav><section className={styles.grid}>{renderedImages.map((image) => <SharedProjectClassicPhotoCard key={image.id} image={image} selected={selected.has(image.id)} pending={selectionSync.pendingImageIds.has(image.id)} onToggle={toggle} />)}<div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />{imagePageLoading ? <p className={styles.state}>사진 목록 불러오는 중…</p> : null}{imagePageError ? <button type="button" className={styles.state} onClick={() => void loadMoreImages()}>{imagePageError} · 다시 시도</button> : null}</section><footer className={styles.footer}><textarea value={memoSync.value} placeholder="전체 메모" maxLength={5000} onChange={(event) => memoSync.setValue(event.target.value)} /><button type="button" disabled={!selected.size || selectionSync.pendingCount > 0 || memoSync.pending || reviewer.can_finalize === false} onClick={() => void openSubmitReview()}>{reviewer.can_finalize === false ? "확정 권한 없음" : `선택 ${selected.size}장 제출하기`}</button><span className={styles.state}>{saveState}</span></footer>{submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={selected.size} sections={[{ label: "고객 셀렉", count: selected.size, detail: memoSync.value.trim() ? "전체 메모 있음" : "전체 메모 없음" }]} items={reviewItems} busy={submitting} error={state} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void submit()} /> : null}</main>;
}
