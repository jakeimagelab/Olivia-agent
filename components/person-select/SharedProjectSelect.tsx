"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomerBridgeSelect, { type CustomerBridgeDraft, type CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import styles from "./SharedProjectSelect.module.css";

type SharedEvent = { id: string; title: string; customer_view_mode?: "classic" | "bridge"; deadline_at: string; nas_download_url?: string | null };
type SharedReviewer = { id: string; display_name: string; role_label?: string | null };
type SharedSelection = { items?: Array<{ image_id: string; customer_rating?: number | null; customer_color_label?: number | null; memo?: string | null }>; customer_memo?: string | null } | null;

function requestKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `shared_${crypto.randomUUID()}` : `shared_${Date.now()}`;
}

function SharedClassicSelect({ shareToken, event, images, draft, selection, onSubmitted }: { shareToken: string; event: SharedEvent; images: CustomerBridgeImage[]; draft: CustomerBridgeDraft | null; selection: SharedSelection; onSubmitted: () => void }) {
  const seed = draft?.selectedImageIds ?? selection?.items?.map((item) => item.image_id) ?? [];
  const [selected, setSelected] = useState(() => new Set(seed));
  const [memo, setMemo] = useState(draft?.customerMemo ?? selection?.customer_memo ?? "");
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [state, setState] = useState("저장됨");
  const revision = useRef(draft?.revision ?? 0);
  const dirty = useRef(false);
  const submitKey = useRef(requestKey());
  const visible = useMemo(() => filter === "selected" ? images.filter((image) => selected.has(image.id)) : images, [filter, images, selected]);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(async () => {
      setState("저장 중");
      const response = await fetch(`/api/pick/shared/${shareToken}/draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, items: [...selected].map((imageId) => ({ imageId, rating: null, memo: "" })), customerMemo: memo }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) return setState("다른 담당자가 변경함 · 새로고침 필요");
      if (!response.ok || !result.ok) return setState(result.error || "저장 실패");
      revision.current = Number(result.draft?.revision ?? revision.current + 1); dirty.current = false; setState("저장됨");
    }, 550);
    return () => window.clearTimeout(timer);
  }, [memo, selected, shareToken]);
  const toggle = (id: string) => { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); dirty.current = true; setState("저장 대기"); };
  const submit = async () => {
    if (!selected.size || !window.confirm(`${selected.size}장을 최종 제출할까요?`)) return;
    const response = await fetch(`/api/pick/shared/${shareToken}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: revision.current, requestKey: submitKey.current, items: [...selected].map((imageId) => ({ imageId, rating: null, memo: "" })), customerMemo: memo }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) return setState(result.error || "제출 실패");
    onSubmitted();
  };
  return <main className={styles.shell}><header className={styles.header}><div><h1>{event.title}</h1><p>마감 {new Date(event.deadline_at).toLocaleString("ko-KR")}</p></div><strong>{selected.size} / {images.length}장 선택</strong></header><nav className={styles.toolbar}><button type="button" className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>전체 사진</button><button type="button" className={filter === "selected" ? styles.active : ""} onClick={() => setFilter("selected")}>선택한 사진</button></nav><section className={styles.grid}>{visible.map((image) => <button type="button" key={image.id} className={styles.card} data-selected={selected.has(image.id)} onClick={() => toggle(image.id)}><img src={image.thumbnail_url || image.image_url} alt={image.original_file_name} loading="lazy" />{/* eslint-disable-line @next/next/no-img-element */}<span>{image.original_file_name}</span>{selected.has(image.id) ? <i className={styles.check}>✓</i> : null}</button>)}</section><footer className={styles.footer}><textarea value={memo} placeholder="전체 메모" onChange={(e) => { setMemo(e.target.value); dirty.current = true; setState("저장 대기"); }} /><button type="button" disabled={!selected.size} onClick={() => void submit()}>선택 {selected.size}장 최종 제출</button><span className={styles.state}>{state}</span></footer></main>;
}

export default function SharedProjectSelect({ shareToken, event, reviewer, images, draft, selection }: { shareToken: string; event: SharedEvent; reviewer: SharedReviewer; images: CustomerBridgeImage[]; draft: CustomerBridgeDraft | null; selection: SharedSelection }) {
  const [submitted, setSubmitted] = useState(false);
  const refreshImageUrl = useCallback(async (imageId: string) => {
    const response = await fetch(`/api/pick/shared/${shareToken}/images/${encodeURIComponent(imageId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.image?.image_url) throw new Error(result.error || "사진 주소를 갱신하지 못했습니다.");
    return { image_url: String(result.image.image_url), thumbnail_url: result.image.thumbnail_url ? String(result.image.thumbnail_url) : null };
  }, [shareToken]);
  if (submitted) return <main className={styles.done}><div><h1>사진 선택을 제출했어요.</h1><p>선택 내용과 메모가 안전하게 저장됐습니다.</p><button type="button" onClick={() => setSubmitted(false)}>선택 다시 확인</button></div></main>;
  if (event.customer_view_mode !== "bridge") return <SharedClassicSelect shareToken={shareToken} event={event} images={images} draft={draft} selection={selection} onSubmitted={() => setSubmitted(true)} />;
  return <CustomerBridgeSelect shareToken={shareToken} storageScope={`person-shared:${event.id}:${reviewer.id}`} apiBase={`/api/pick/shared/${shareToken}`} gallery={{ id: event.id, title: event.title, total_jpg_count: images.length, allow_resubmit: true, nas_download_url: event.nas_download_url }} images={images} initialDraft={draft} initialSelection={selection} reviewer={reviewer} messagesEnabled onSubmitted={() => setSubmitted(true)} refreshImageUrl={refreshImageUrl} />;
}
