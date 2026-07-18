"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";

type TrashItem = {
  id: string;
  source_type: string;
  source_label: string;
  title: string;
  preview: string;
  deleted_at: string;
  expires_at: string;
};

const C = {
  ink: "#172522", teal: "#155855", orange: "#E85D2C", muted: "#607873",
  mist: "#EDF5F3", line: "rgba(21,88,85,.13)", white: "#FFFFFF", red: "#B42318",
};

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/trash", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "휴지통 조회 실패");
      setItems(data.items);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "휴지통 조회 실패" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sources = useMemo(() => Array.from(new Map(items.map(item => [item.source_type, item.source_label]))), [items]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return items.filter(item => (source === "all" || item.source_type === source)
      && (!normalized || `${item.title} ${item.preview} ${item.source_label}`.toLocaleLowerCase("ko").includes(normalized)));
  }, [items, query, source]);

  const restore = async (item: TrashItem) => {
    setWorking(item.id); setMessage(null);
    try {
      const response = await fetch(`/api/trash/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "복원 실패");
      setItems(current => current.filter(row => row.id !== item.id));
      setMessage({ ok: true, text: `${item.source_label} 항목을 원래 위치로 복원했습니다.` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "복원 실패" });
    } finally { setWorking(null); }
  };

  const removeForever = async (item: TrashItem) => {
    if (!window.confirm(`‘${item.title}’을(를) 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setWorking(item.id); setMessage(null);
    try {
      const response = await fetch(`/api/trash/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "영구 삭제 실패");
      setItems(current => current.filter(row => row.id !== item.id));
      setMessage({ ok: true, text: "항목을 영구 삭제했습니다." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "영구 삭제 실패" });
    } finally { setWorking(null); }
  };

  return (
    <main style={{ minHeight: "100dvh", background: C.mist, color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="휴지통" />
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "22px 13px 64px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ margin: 0, color: C.muted, fontSize: 11, lineHeight: 1.7 }}>삭제한 항목의 원래 기능을 확인하고 30일 안에 복원할 수 있습니다.</p>
          <div style={{ padding: "8px 12px", borderRadius: 99, background: C.white, boxShadow: "0 18px 50px rgba(21,88,85,.08)", color: C.teal, fontWeight: 900, fontSize: 10, whiteSpace: "nowrap" }}>{items.length}개 보관 중</div>
        </div>

        <div style={{ padding: 5, borderRadius: 18, background: "rgba(21,88,85,.06)", boxShadow: "0 24px 70px rgba(21,88,85,.07)", marginBottom: 14 }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 11, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(150px,220px)", gap: 8 }}>
            <input aria-label="휴지통 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="제목이나 내용 검색" style={{ minHeight: 35, border: "none", borderRadius: 10, background: C.mist, padding: "0 11px", font: "inherit", fontSize: 10, outline: "none" }} />
            <select aria-label="원래 기능 필터" value={source} onChange={event => setSource(event.target.value)} style={{ minHeight: 35, border: "none", borderRadius: 10, background: C.mist, padding: "0 10px", font: "inherit", fontSize: 10, color: C.teal, fontWeight: 800 }}>
              <option value="all">모든 기능</option>
              {sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {message ? <div role="status" style={{ marginBottom: 11, padding: "9px 12px", borderRadius: 10, background: message.ok ? "#E4F4EE" : "#FFF0ED", color: message.ok ? C.teal : C.red, fontSize: 10, fontWeight: 800 }}>{message.text}</div> : null}

        <div style={{ display: "grid", gap: 9 }}>
          {loading ? <div style={{ padding: 30, textAlign: "center", color: C.muted }}>휴지통을 불러오는 중…</div> : null}
          {!loading && filtered.length === 0 ? <div style={{ padding: 37, borderRadius: 16, background: C.white, textAlign: "center", color: C.muted }}>조건에 맞는 삭제 항목이 없습니다.</div> : null}
          {filtered.map(item => (
            <article key={item.id} style={{ padding: 5, borderRadius: 18, background: "rgba(21,88,85,.055)" }}>
              <div style={{ borderRadius: 14, background: C.white, padding: "14px 16px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ padding: "3px 7px", borderRadius: 99, background: "rgba(21,88,85,.09)", color: C.teal, fontSize: 9, fontWeight: 900 }}>{item.source_label}</span>
                    <span style={{ color: daysLeft(item.expires_at) <= 5 ? C.orange : C.muted, fontSize: 9, fontWeight: 800 }}>{daysLeft(item.expires_at)}일 후 영구 삭제</span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: 13, letterSpacing: "-.02em" }}>{item.title}</h2>
                  {item.preview ? <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 10, lineHeight: 1.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.preview}</p> : null}
                  <time style={{ display: "block", marginTop: 6, color: "#8BA19D", fontSize: 9 }}>{new Date(item.deleted_at).toLocaleString("ko-KR")} 삭제</time>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button disabled={working === item.id} onClick={() => void restore(item)} style={{ minHeight: 32, padding: "0 13px", border: "none", borderRadius: 99, background: C.teal, color: C.white, font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>복원</button>
                  <button disabled={working === item.id} onClick={() => void removeForever(item)} style={{ minHeight: 32, padding: "0 11px", border: "none", borderRadius: 99, background: "#FFF0ED", color: C.red, font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>영구 삭제</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
