"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerBridgeDraft, CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import { SELECTION_THUMBNAIL_PAGE_SIZE, type SelectionMediaUrls, type SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import { toggleClassicSelectionId } from "@/lib/person-select/classicSelection";
import { applySelectionDiffsToSharedSnapshot, type SelectionSyncDiff, type SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";
import { readSelectionJsonResponse, sendSelectionSyncBatch } from "@/lib/person-select/selectionSyncClient";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import { useSelectionSyncQueue } from "./useSelectionSyncQueue";
import { useSharedCustomerMemoSync } from "./useSharedCustomerMemoSync";
import { useVisibleSelectionRefresh } from "./useVisibleSelectionRefresh";
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
  const serverSnapshotRef = useRef(initialSnapshot);
  const [selected, setSelected] = useState(() => new Set(seed));
  const selectedRef = useRef(selected);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [state, setState] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitKey = useRef(requestKey());
  const [urlOverrides, setUrlOverrides] = useState<SharedProjectImageUrls>({});
  const [renderLimit, setRenderLimit] = useState(SELECTION_THUMBNAIL_PAGE_SIZE);
  const loadingIds = useRef(new Set<string>());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const images = useMemo(() => initialImages.map((image) => urlOverrides[image.id] ? { ...image, ...urlOverrides[image.id] } : image), [initialImages, urlOverrides]);
  const visible = useMemo(() => filter === "selected" ? images.filter((image) => selected.has(image.id)) : images, [filter, images, selected]);
  const rendered = useMemo(() => visible.slice(0, renderLimit), [renderLimit, visible]);

  const replaceSelected = useCallback((next: Set<string>) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const installSnapshot = useCallback((snapshot: SharedSelectionSyncSnapshot, pending: SelectionSyncDiff[]) => {
    serverSnapshotRef.current = snapshot;
    replaceSelected(new Set(applySelectionDiffsToSharedSnapshot(snapshot, pending).selectedImageIds));
    setState("");
  }, [replaceSelected]);
  const sendBatch = useCallback(async ({ clientId, diffs }: { clientId: string; diffs: SelectionSyncDiff[] }) => {
    return sendSelectionSyncBatch<SharedSelectionSyncSnapshot>({
      endpoint: `/api/pick/shared/${shareToken}/draft`,
      clientId,
      diffs,
      responseKey: "draft",
    });
  }, [shareToken]);
  const selectionSync = useSelectionSyncQueue({
    storageKey: `person-select-classic-sync:${event.id}:${reviewer.id}`,
    sendBatch,
    onSnapshot: installSnapshot,
    onRestore: (pending) => replaceSelected(new Set(applySelectionDiffsToSharedSnapshot(serverSnapshotRef.current, pending).selectedImageIds)),
  });
  const memoSync = useSharedCustomerMemoSync<SharedSelectionSyncSnapshot>({
    storageKey: `person-select-classic-memo:${event.id}:${reviewer.id}`,
    endpoint: `/api/pick/shared/${shareToken}/draft`,
    initialValue: initialSnapshot.customerMemo,
    enabled: true,
    onSnapshot: (snapshot) => installSnapshot(snapshot, selectionSync.getPendingDiffs()),
  });
  const getPendingSelectionDiffs = selectionSync.getPendingDiffs;

  useEffect(() => { setRenderLimit(SELECTION_THUMBNAIL_PAGE_SIZE); }, [filter]);
  useEffect(() => {
    const missing = rendered.filter((image) => !image.thumbnail_url && !loadingIds.current.has(image.id)).map((image) => image.id);
    if (!missing.length) return;
    missing.forEach((id) => loadingIds.current.add(id));
    void loadImageUrls(missing, { variant: "thumbnail" })
      .then((next) => setUrlOverrides((current) => ({ ...current, ...next })))
      .catch((cause) => setState(cause instanceof Error ? cause.message : "사진을 불러오지 못했습니다."))
      .finally(() => missing.forEach((id) => loadingIds.current.delete(id)));
  }, [loadImageUrls, rendered]);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setRenderLimit((current) => {
        const next = Math.min(visible.length, current + SELECTION_THUMBNAIL_PAGE_SIZE);
        if (next === current && hasMoreImages && !imagePageLoading) void loadMoreImages();
        return next;
      });
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreImages, imagePageLoading, loadMoreImages, visible.length]);

  const refreshServerDraft = useCallback(async () => {
    try {
      const response = await fetch(`/api/pick/shared/${shareToken}/draft`, { cache: "no-store" });
      const result = await readSelectionJsonResponse<{ ok?: boolean; draft?: SharedSelectionSyncSnapshot }>(response);
      if (response.ok && result?.ok && result.draft) installSnapshot(result.draft, getPendingSelectionDiffs());
    } catch {
      // 저장 대기 변경은 유지하고 다음 focus에서 다시 확인한다.
    }
  }, [getPendingSelectionDiffs, installSnapshot, shareToken]);
  useVisibleSelectionRefresh({ refresh: refreshServerDraft });

  const toggle = useCallback((id: string) => {
    const update = toggleClassicSelectionId(selectedRef.current, id);
    replaceSelected(update.selectedIds);
    selectionSync.enqueue(update.selected
      ? [{ imageId: id, rating: 5 }]
      : [{ imageId: id, rating: null }, { imageId: id, colorLabel: null }]);
  }, [replaceSelected, selectionSync]);

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
  const saveState = state || (selectionSync.status === "saved" && memoSync.status === "saved"
    ? "저장됨 · 서버 기준"
    : selectionSync.status === "saving" || memoSync.status === "saving"
      ? "저장 중…"
      : selectionSync.status === "retrying" || memoSync.status === "retrying"
        ? `저장 안 된 변경 ${selectionSync.pendingCount + (memoSync.pending ? 1 : 0)}건 · 잠시 후 자동 저장`
        : `저장 안 된 변경 ${selectionSync.pendingCount + (memoSync.pending ? 1 : 0)}건 · 잠시 후 저장`);
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

  return <main className={styles.shell}><header className={styles.header}><div><h1>{event.title}</h1><p>마감 {new Date(event.deadline_at).toLocaleString("ko-KR")}</p></div><strong>{selected.size} / {totalImageCount}장 선택</strong></header><nav className={styles.toolbar}><button type="button" className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>전체 사진</button><button type="button" className={filter === "selected" ? styles.active : ""} onClick={() => setFilter("selected")}>선택한 사진</button></nav><section className={styles.grid}>{rendered.map((image) => <button type="button" key={image.id} className={styles.card} data-selected={selected.has(image.id)} data-pending={selectionSync.pendingImageIds.has(image.id)} onClick={() => toggle(image.id)}>{image.thumbnail_url || image.image_url ? <img src={image.thumbnail_url || image.image_url} alt={image.original_file_name} loading="lazy" /> : <span className={styles.imageLoading}>사진 불러오는 중</span>}<span>{image.original_file_name}</span>{selected.has(image.id) ? <i className={styles.check}>✓</i> : null}{selectionSync.pendingImageIds.has(image.id) ? <i className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}</button>)}<div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />{imagePageLoading ? <p className={styles.state}>사진 목록 불러오는 중…</p> : null}{imagePageError ? <button type="button" className={styles.state} onClick={() => void loadMoreImages()}>{imagePageError} · 다시 시도</button> : null}</section><footer className={styles.footer}><textarea value={memoSync.value} placeholder="전체 메모" maxLength={5000} onChange={(event) => memoSync.setValue(event.target.value)} /><button type="button" disabled={!selected.size || selectionSync.pendingCount > 0 || memoSync.pending || reviewer.can_finalize === false} onClick={() => void openSubmitReview()}>{reviewer.can_finalize === false ? "확정 권한 없음" : `선택 ${selected.size}장 제출하기`}</button><span className={styles.state}>{saveState}</span></footer>{submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={selected.size} sections={[{ label: "고객 셀렉", count: selected.size, detail: memoSync.value.trim() ? "전체 메모 있음" : "전체 메모 없음" }]} items={reviewItems} busy={submitting} error={state} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void submit()} /> : null}</main>;
}
