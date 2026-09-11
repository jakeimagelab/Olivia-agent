"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, StickyNote } from "lucide-react";
import MobileHeader from "./MobileHeader";
import styles from "./OliviaMobileShell.module.css";

type Memo = { id: string; hospital_id?: string | null; title: string; raw_memo?: string; summary?: string; created_at?: string; updated_at?: string };
type Client = { id: string; hospital_name: string };
type MemoDraft = { id?: string; title: string; body: string; clientId: string };

function memoDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MobileMemo() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<MemoDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/memo", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "메모를 불러오지 못했어요.");
      setMemos(payload.memos || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "메모를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!draft || clients.length) return;
    fetch("/api/clients?scope=list", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (payload?.ok) setClients((payload.clients || []).map((client: Record<string, unknown>) => ({ id: String(client.id), hospital_name: String(client.hospital_name || client.name || "") }))); })
      .catch(() => undefined);
  }, [clients.length, draft]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("olivia-resource-updated", refresh);
    return () => window.removeEventListener("olivia-resource-updated", refresh);
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? memos.filter((memo) => `${memo.title} ${memo.raw_memo || ""} ${memo.summary || ""}`.toLowerCase().includes(normalized)) : memos;
  }, [memos, query]);

  const openMemo = (memo: Memo) => setDraft({ id: memo.id, title: memo.title || "", body: memo.raw_memo || "", clientId: memo.hospital_id || "" });

  const save = async () => {
    if (!draft?.title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save", id: draft.id, title: draft.title.trim(), raw_memo: draft.body,
          template_type: "text", template_data: { body: draft.body }, hospital_id: draft.clientId || null,
          ...(draft.clientId ? { context_type: "customer", context_id: draft.clientId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "메모를 저장하지 못했어요.");
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "메모를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 메모">
      <MobileHeader title="메모" subtitle="아이디어와 업무 기록을 정리하세요." onAdd={() => setDraft({ title: "", body: "", clientId: "" })} />
      <div className={styles.scrollBody}>
        <label className={styles.searchField}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="메모 검색" /></label>
        <div className={styles.listHeading}><h3>최근 메모</h3><span>{filtered.length}</span></div>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>메모를 확인하고 있어요...</div> : filtered.length ? (
          <div className={styles.memoList}>{filtered.map((memo) => <button type="button" key={memo.id} onClick={() => openMemo(memo)}>
            <span><StickyNote size={18} /></span>
            <span><strong>{memo.title || "제목 없는 메모"}</strong><small>{memoDate(memo.updated_at || memo.created_at)}</small><p>{memo.raw_memo || memo.summary || "내용이 없는 메모"}</p></span>
          </button>)}</div>
        ) : <div className={styles.emptyState}><StickyNote size={22} /><span>{query ? "검색 결과가 없어요." : "아직 작성한 메모가 없어요."}</span></div>}
      </div>

      {draft ? <div className={styles.sheetBackdrop} onPointerDown={() => setDraft(null)}>
        <form className={styles.sheet} onSubmit={(event) => { event.preventDefault(); void save(); }} onPointerDown={(event) => event.stopPropagation()}>
          <div className={styles.sheetHandle} />
          <header><h2>{draft.id ? "메모 수정" : "새 메모"}</h2><button type="button" onClick={() => setDraft(null)}>닫기</button></header>
          <label><span>제목</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="메모 제목" /></label>
          <label><span>내용</span><textarea rows={7} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="아이디어와 업무 내용을 적어주세요." /></label>
          <label><span>관련 고객 (선택)</span><select value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}><option value="">연결하지 않음</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.hospital_name}</option>)}</select></label>
          <button type="submit" className={styles.sheetSave} disabled={saving || !draft.title.trim()}>{saving ? "저장 중..." : "저장"}</button>
        </form>
      </div> : null}
    </section>
  );
}
