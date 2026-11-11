"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomerBridgeSelect, { type CustomerBridgeDraft, type CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import { applySelectionDiffsToSharedSnapshot, type SelectionSyncDiff, type SharedSelectionSyncSnapshot } from "@/lib/person-select/selectionSync";
import { SelectionSyncRequestError, useSelectionSyncQueue } from "./useSelectionSyncQueue";
import { useSharedCustomerMemoSync } from "./useSharedCustomerMemoSync";
import PersonSelectDeliveryReview from "./PersonSelectDeliveryReview";
import styles from "./SharedProjectSelect.module.css";

type SharedEvent = { id: string; title: string; customer_view_mode?: "classic" | "bridge"; customer_stage?: "select" | "delivery"; deadline_at: string; download_available?: boolean; customer_ai_results_visible?: boolean };
type SharedReviewer = { id: string; display_name: string; role_label?: string | null; can_view_ai_results?: boolean; can_download_jpg?: boolean; can_download_raw?: boolean; can_finalize?: boolean };
type SharedSelection = { items?: Array<{ image_id: string; customer_rating?: number | null; customer_color_label?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `shared_${crypto.randomUUID()}` : `shared_${Date.now()}`;
}

type SharedImageUrls = Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;

function SharedClassicSelect({ shareToken, event, reviewer, images: initialImages, draft, selection, onSubmitted, loadImageUrls }: { shareToken: string; event: SharedEvent; reviewer: SharedReviewer; images: CustomerBridgeImage[]; draft: CustomerBridgeDraft | null; selection: SharedSelection; onSubmitted: () => void; loadImageUrls: (imageIds: string[]) => Promise<SharedImageUrls> }) {
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
  const [serverSelected, setServerSelected] = useState(() => new Set(seed));
  const [selected, setSelected] = useState(() => new Set(seed));
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [state, setState] = useState("");
  const submitKey = useRef(requestKey());
  const [urlOverrides, setUrlOverrides] = useState<SharedImageUrls>({});
  const [renderLimit, setRenderLimit] = useState(240);
  const loadingIds = useRef(new Set<string>());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const images = useMemo(() => initialImages.map((image) => urlOverrides[image.id] ? { ...image, ...urlOverrides[image.id] } : image), [initialImages, urlOverrides]);
  const visible = useMemo(() => filter === "selected" ? images.filter((image) => serverSelected.has(image.id)) : images, [filter, images, serverSelected]);
  const rendered = useMemo(() => visible.slice(0, renderLimit), [renderLimit, visible]);

  const installSnapshot = useCallback((snapshot: SharedSelectionSyncSnapshot, pending: SelectionSyncDiff[]) => {
    serverSnapshotRef.current = snapshot;
    setServerSelected(new Set(snapshot.selectedImageIds));
    setSelected(new Set(applySelectionDiffsToSharedSnapshot(snapshot, pending).selectedImageIds));
    setState("");
  }, []);
  const sendBatch = useCallback(async ({ clientId, diffs }: { clientId: string; diffs: SelectionSyncDiff[] }) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, diffs }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.draft) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? 0);
      throw new SelectionSyncRequestError(result.error ?? "선택을 저장하지 못했습니다.", {
        retryable: ![400, 401, 403, 404, 410, 423].includes(response.status),
        retryAfterMs: retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined,
      });
    }
    return result.draft as SharedSelectionSyncSnapshot;
  }, [shareToken]);
  const selectionSync = useSelectionSyncQueue({
    storageKey: `person-select-classic-sync:${event.id}:${reviewer.id}`,
    sendBatch,
    onSnapshot: installSnapshot,
    onRestore: (pending) => setSelected(new Set(applySelectionDiffsToSharedSnapshot(serverSnapshotRef.current, pending).selectedImageIds)),
  });
  const memoSync = useSharedCustomerMemoSync<SharedSelectionSyncSnapshot>({
    storageKey: `person-select-classic-memo:${event.id}:${reviewer.id}`,
    endpoint: `/api/pick/shared/${shareToken}/draft`,
    initialValue: initialSnapshot.customerMemo,
    enabled: true,
    onSnapshot: (snapshot) => installSnapshot(snapshot, selectionSync.getPendingDiffs()),
  });
  useEffect(() => { setRenderLimit(240); }, [filter]);
  useEffect(() => {
    const missing = rendered.filter((image) => !image.thumbnail_url && !loadingIds.current.has(image.id)).map((image) => image.id);
    if (!missing.length) return;
    missing.forEach((id) => loadingIds.current.add(id));
    void loadImageUrls(missing)
      .then((next) => setUrlOverrides((current) => ({ ...current, ...next })))
      .catch((cause) => setState(cause instanceof Error ? cause.message : "사진을 불러오지 못했습니다."))
      .finally(() => missing.forEach((id) => loadingIds.current.delete(id)));
  }, [loadImageUrls, rendered]);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setRenderLimit((current) => Math.min(visible.length, current + 240));
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length]);
  const refreshServerDraft = useCallback(async () => {
    try {
      const response = await fetch(`/api/pick/shared/${shareToken}/draft`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok && result.draft) installSnapshot(result.draft as SharedSelectionSyncSnapshot, selectionSync.getPendingDiffs());
    } catch {
      // 저장 대기 변경은 유지하고 다음 focus에서 다시 확인한다.
    }
  }, [installSnapshot, selectionSync, shareToken]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void refreshServerDraft(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshServerDraft]);
  const toggle = (id: string) => {
    const removing = selected.has(id);
    setSelected((current) => {
      const next = new Set(current);
      if (removing) next.delete(id); else next.add(id);
      return next;
    });
    selectionSync.enqueue(removing
      ? [{ imageId: id, rating: null }, { imageId: id, colorLabel: null }]
      : [{ imageId: id, rating: 1 }]);
  };
  const submit = async () => {
    if (!serverSelected.size || selectionSync.pendingCount || memoSync.pending || !window.confirm(`${serverSelected.size}장을 최종 제출할까요?`)) return;
    if (!(await selectionSync.flushNow()) || !(await memoSync.flushNow())) { setState("저장 안 된 변경이 있어 제출할 수 없습니다."); return; }
    const response = await fetch(`/api/pick/shared/${shareToken}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: submitKey.current }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) return setState(result.error || "제출 실패");
    onSubmitted();
  };
  const saveState = state || (selectionSync.status === "saved" && memoSync.status === "saved"
    ? "저장됨 · 서버 기준"
    : selectionSync.status === "saving" || memoSync.status === "saving"
      ? "저장 중…"
      : selectionSync.status === "retrying" || memoSync.status === "retrying"
        ? `저장 안 된 변경 ${selectionSync.pendingCount + (memoSync.pending ? 1 : 0)}건 · 잠시 후 자동 저장`
        : `저장 안 된 변경 ${selectionSync.pendingCount + (memoSync.pending ? 1 : 0)}건 · 잠시 후 저장`);
  return <main className={styles.shell}><header className={styles.header}><div><h1>{event.title}</h1><p>마감 {new Date(event.deadline_at).toLocaleString("ko-KR")}</p></div><strong>{serverSelected.size} / {images.length}장 선택</strong></header><nav className={styles.toolbar}><button type="button" className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>전체 사진</button><button type="button" className={filter === "selected" ? styles.active : ""} onClick={() => setFilter("selected")}>선택한 사진</button></nav><section className={styles.grid}>{rendered.map((image) => <button type="button" key={image.id} className={styles.card} data-selected={selected.has(image.id)} data-pending={selectionSync.pendingImageIds.has(image.id)} onClick={() => toggle(image.id)}>{image.thumbnail_url || image.image_url ? <img src={image.thumbnail_url || image.image_url} alt={image.original_file_name} loading="lazy" /> : <span className={styles.imageLoading}>사진 불러오는 중</span>}<span>{image.original_file_name}</span>{selected.has(image.id) ? <i className={styles.check}>✓</i> : null}{selectionSync.pendingImageIds.has(image.id) ? <i className={styles.pendingDot} aria-label="저장 안 된 변경" /> : null}</button>)}<div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" /></section><footer className={styles.footer}><textarea value={memoSync.value} placeholder="전체 메모" maxLength={5000} onChange={(e) => memoSync.setValue(e.target.value)} /><button type="button" disabled={!serverSelected.size || selectionSync.pendingCount > 0 || memoSync.pending || reviewer.can_finalize === false} onClick={() => void submit()}>{reviewer.can_finalize === false ? "확정 권한 없음" : `선택 ${serverSelected.size}장 최종 제출`}</button><span className={styles.state}>{saveState}</span></footer></main>;
}

export default function SharedProjectSelect({ shareToken, event, reviewer, images, draft, selection }: { shareToken: string; event: SharedEvent; reviewer: SharedReviewer; images: CustomerBridgeImage[]; draft: CustomerBridgeDraft | null; selection: SharedSelection }) {
  const [submitted, setSubmitted] = useState(false);
  const loadImageUrls = useCallback(async (imageIds: string[]) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.images) throw new Error(result.error || "사진 주소를 불러오지 못했습니다.");
    return result.images as SharedImageUrls;
  }, [shareToken]);
  const refreshImageUrl = useCallback(async (imageId: string) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/images/${encodeURIComponent(imageId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.image?.image_url) throw new Error(result.error || "사진 주소를 갱신하지 못했습니다.");
    return { image_url: String(result.image.image_url), thumbnail_url: result.image.thumbnail_url ? String(result.image.thumbnail_url) : null };
  }, [shareToken]);
  if (event.customer_stage === "delivery") return <PersonSelectDeliveryReview apiBase={`/api/pick/shared/${shareToken}`} title={event.title} viewerName={reviewer.display_name} canFinalize={reviewer.can_finalize !== false} />;
  if (submitted) return <main className={styles.done}><div><h1>사진 선택을 제출했어요.</h1><p>선택 내용과 메모가 안전하게 저장됐습니다.</p><button type="button" onClick={() => setSubmitted(false)}>선택 다시 확인</button></div></main>;
  if (event.customer_view_mode !== "bridge") return <SharedClassicSelect shareToken={shareToken} event={event} reviewer={reviewer} images={images} draft={draft} selection={selection} onSubmitted={() => setSubmitted(true)} loadImageUrls={loadImageUrls} />;
  return <CustomerBridgeSelect shareToken={shareToken} storageScope={`person-shared:${event.id}:${reviewer.id}`} apiBase={`/api/pick/shared/${shareToken}`} qualityApi={event.customer_ai_results_visible && reviewer.can_view_ai_results ? `/api/pick/shared/${shareToken}/quality` : undefined} gallery={{ id: event.id, title: event.title, total_jpg_count: images.length, allow_resubmit: true, download_jpg_enabled: event.download_available === true && reviewer.can_download_jpg === true, download_raw_enabled: event.download_available === true && reviewer.can_download_raw === true }} images={images} initialDraft={draft} initialSelection={selection} reviewer={reviewer} messagesEnabled onSubmitted={() => setSubmitted(true)} refreshImageUrl={refreshImageUrl} loadImageUrls={loadImageUrls} />;
}
