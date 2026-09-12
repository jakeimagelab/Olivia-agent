"use client";

import { useEffect, useState } from "react";
import { Copy, FolderOpen, Search, X } from "lucide-react";
import styles from "@/components/conti/v2/ContiV2.module.css";

interface PreviousContiRow {
  id: string;
  hospital_name?: string;
  specialty?: string;
  updated_at?: string;
  created_at?: string;
  scene_count?: number;
}

export default function ContiPreviousDrawer({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (runId: string) => void }) {
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<PreviousContiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams({ list: "1", limit: "40" });
      if (query.trim()) params.set("query", query.trim());
      fetch(`/api/conti/runs?${params}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.json().then((body) => ({ response, body })))
        .then(({ response, body }) => {
          if (!response.ok || !body.ok) throw new Error(body.error ?? "이전 콘티를 불러오지 못했습니다.");
          setRuns(body.runs ?? []);
        })
        .catch((caught) => { if (caught instanceof DOMException && caught.name === "AbortError") return; setError(caught instanceof Error ? caught.message : "이전 콘티를 불러오지 못했습니다."); })
        .finally(() => setLoading(false));
    }, 220);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  async function clone(runId: string) {
    setCloningId(runId); setError("");
    try {
      const response = await fetch(`/api/conti/runs/${runId}/clone`, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.run?.id) throw new Error(body.error ?? "콘티 복제에 실패했습니다.");
      onOpen(body.run.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "콘티 복제에 실패했습니다.");
    } finally {
      setCloningId(null);
    }
  }

  if (!open) return null;
  return (
    <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={styles.previousDrawer} role="dialog" aria-modal="true" aria-label="이전 콘티">
        <header className={styles.drawerHeader}>
          <div><span>CONTI LIBRARY</span><h2>이전 콘티</h2></div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>
        <label className={styles.drawerSearch}><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="병원명 또는 진료과 검색" /></label>
        {error ? <p className={styles.drawerError}>{error}</p> : null}
        <div className={styles.previousList}>
          {loading ? <p className={styles.drawerEmpty}>불러오는 중…</p> : null}
          {!loading && !runs.length ? <p className={styles.drawerEmpty}>조건에 맞는 이전 콘티가 없습니다.</p> : null}
          {!loading && runs.map((run) => (
            <article key={run.id} className={styles.previousItem}>
              <div className={styles.previousItemCopy}>
                <strong>{run.hospital_name || "병원 미연결 콘티"}</strong>
                <span>{run.specialty || "진료과 미지정"} · {run.scene_count ?? 0} Scene</span>
                <time>{formatDate(run.updated_at || run.created_at)}</time>
              </div>
              <div className={styles.previousActions}>
                <button type="button" onClick={() => onOpen(run.id)}><FolderOpen size={14} />열기</button>
                <button type="button" disabled={cloningId === run.id} onClick={() => void clone(run.id)}><Copy size={14} />{cloningId === run.id ? "복제 중…" : "복제"}</button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
