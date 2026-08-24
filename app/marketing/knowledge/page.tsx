"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { C, R, FS, SP } from "@/lib/theme";

type Patch = {
  id: string;
  title: string;
  category: string;
  content: string;
  is_active: boolean;
  created_at: string;
};

const CATEGORY_PRESETS = [
  { value: "marketing", label: "마케팅" },
  { value: "workflow", label: "워크플로우" },
  { value: "client_comm", label: "고객 응대" },
];

function categoryLabel(category: string) {
  return CATEGORY_PRESETS.find((c) => c.value === category)?.label || category || "미분류";
}

function NewPatchForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("marketing");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim() || !content.trim()) { setError("제목과 내용을 모두 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/olivia/knowledge-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, content }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "저장 실패");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`, padding: 18, marginBottom: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>지식 패치 추가</h2>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="패치 제목 (예: 인스타 콘텐츠 반응 패턴 2026-07)"
        style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)}
        style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md, background: C.white }}>
        {CATEGORY_PRESETS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5}
        placeholder="Olivia가 이후 관련 대화에서 항상 참고할 내용을 붙여넣으세요."
        style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 12, fontSize: FS.md, fontFamily: "inherit", resize: "vertical" }} />
      {error && <p style={{ color: C.danger, fontSize: FS.sm, margin: 0 }}>{error}</p>}
      <button onClick={submit} disabled={saving} style={{
        height: 42, borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontWeight: 800, fontSize: FS.md, cursor: "pointer", opacity: saving ? 0.6 : 1,
      }}>{saving ? "저장 중…" : "패치 저장"}</button>
    </div>
  );
}

export default function KnowledgePatchesPage() {
  const router = useRouter();
  const [patches, setPatches] = useState<Patch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/olivia/knowledge-patches?includeInactive=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setPatches(json?.ok ? json.patches : []))
      .catch(() => setPatches([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (patch: Patch) => {
    setPatches((current) => current.map((p) => (p.id === patch.id ? { ...p, is_active: !p.is_active } : p)));
    await fetch(`/api/olivia/knowledge-patches/${patch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !patch.is_active }),
    }).catch(() => {});
  };

  const visiblePatches = patches.filter((p) => showInactive || p.is_active);

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
      <PageHeader title="마케팅 대시보드" />
      <div className="oa-page" style={{ maxWidth: 780, margin: "0 auto", padding: `${SP.lg}px 20px 60px` }}>
        <button onClick={() => router.push("/marketing/strategy")} style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent",
          color: C.muted, fontWeight: 700, fontSize: FS.sm, cursor: "pointer", marginBottom: 16, padding: 0,
        }}><ArrowLeft size={15} /> 전략 목록</button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: FS.xxl, fontWeight: 900, color: C.ink }}>Olivia 지식 패치</h1>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px",
              borderRadius: R.md, border: "none", background: C.orange, color: "#fff", fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
            }}><Plus size={14} /> 패치 추가</button>
          )}
        </div>
        <p style={{ margin: "6px 0 18px", fontSize: FS.sm, color: C.muted, lineHeight: 1.6 }}>
          여기에 저장한 인사이트는 관련 카테고리 대화에서 Olivia가 자동으로 참고합니다.
        </p>

        {showForm && <NewPatchForm onClose={() => setShowForm(false)} onCreated={load} />}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: C.muted, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          비활성화된 패치도 표시
        </label>

        {loading ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 40 }}>불러오는 중…</p>
        ) : visiblePatches.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, background: C.white, borderRadius: R.lg, border: `1px dashed ${C.border}` }}>
            아직 등록된 지식 패치가 없어요.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visiblePatches.map((p) => (
              <div key={p.id} style={{
                background: C.white, borderRadius: R.md, border: `1px solid ${C.border}`, padding: 14,
                opacity: p.is_active ? 1 : 0.55,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: FS.xs, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: R.full, padding: "2px 10px" }}>
                      {categoryLabel(p.category)}
                    </span>
                    <strong style={{ fontSize: FS.md, color: C.ink }}>{p.title}</strong>
                  </div>
                  <button onClick={() => toggleActive(p)} style={{
                    height: 26, padding: "0 10px", borderRadius: R.full, fontSize: FS.xs, fontWeight: 800, cursor: "pointer",
                    border: `1px solid ${p.is_active ? C.border : C.teal}`,
                    background: p.is_active ? C.white : C.teal,
                    color: p.is_active ? C.muted : "#fff",
                  }}>{p.is_active ? "비활성화" : "활성화"}</button>
                </div>
                <p style={{ margin: 0, fontSize: FS.sm, color: C.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
