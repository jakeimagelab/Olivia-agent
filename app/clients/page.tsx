"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { createMailingDraft } from "@/lib/mailingQueue";
import { Users, Plus, Search, Mail, ExternalLink, Pencil, X, RefreshCw } from "lucide-react";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", sage: "#569082",
};

const WORKFLOW_STATUSES = [
  "상담완료", "견적생성", "견적전달완료", "계약생성", "계약완료",
  "콘티생성", "콘티전달완료", "촬영예정", "촬영완료",
  "원본전달완료", "보정진행", "갤러리전달완료", "수정요청",
  "최종완료", "리뷰수집완료", "구독운영중",
];

const STATUS_COLOR: Record<string, string> = {
  "상담완료": "#9BB5B0", "견적생성": "#569082", "견적전달완료": "#155855",
  "계약생성": "#EB8F22", "계약완료": "#E85D2C", "콘티생성": "#7C9893",
  "촬영예정": "#155855", "촬영완료": "#22876A", "원본전달완료": "#155855",
  "보정진행": "#EB8F22", "갤러리전달완료": "#E85D2C", "최종완료": "#22876A",
  "구독운영중": "#E85D2C",
};

const STATUS_GROUP: Record<string, string[]> = {
  "준비": ["상담완료", "견적생성", "견적전달완료", "계약생성", "계약완료"],
  "제작": ["콘티생성", "콘티전달완료", "촬영예정", "촬영완료", "원본전달완료", "보정진행"],
  "완료": ["갤러리전달완료", "수정요청", "최종완료", "리뷰수집완료", "구독운영중"],
};

type Gallery = {
  id: string; hospital_name: string; contact_name?: string;
  contact_email?: string; shoot_date?: string; nas_link: string;
  description?: string; created_at?: string;
  items?: { thumbnail_url?: string }[];
  workflow_status?: string;
};

const iS: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "0 12px", height: 42, fontSize: 13, fontFamily: "inherit",
  outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
};
const taS: React.CSSProperties = { ...iS, height: "auto", padding: "10px 12px" };

const displayDate = (v?: string) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
};

const compressImage = (file: File) =>
  new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, 1200 / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      if (!ctx) { reject(new Error("canvas 오류")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob(b => b ? resolve(b) : reject(new Error("변환 실패")), "image/webp", 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지 읽기 실패")); };
    img.src = url;
  });

/* ── 클라이언트 카드 ───────────────────────────────────────── */
function ClientCard({ g, selected, onSelect, onEdit }: {
  g: Gallery; selected: boolean; onSelect: () => void; onEdit: () => void;
}) {
  const thumb = g.items?.[0]?.thumbnail_url || "";
  const sc = STATUS_COLOR[g.workflow_status || ""] || C.sage;

  return (
    <div onClick={onSelect} style={{
      background: C.white, borderRadius: 14,
      border: `1.5px solid ${selected ? C.teal : C.border}`,
      boxShadow: selected ? `0 0 0 2px ${C.teal}22` : "0 2px 12px rgba(21,88,85,.06)",
      padding: "16px", cursor: "pointer", transition: "all .15s",
      position: "relative", overflow: "hidden",
    }}>
      {/* 선택 체크 */}
      <div style={{
        position: "absolute", top: 12, right: 12,
        width: 20, height: 20, borderRadius: "50%",
        border: `2px solid ${selected ? C.teal : C.border}`,
        background: selected ? C.teal : C.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .15s",
      }}>
        {selected && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>

      {/* 상단: 썸네일 + 병원명 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: 10, background: C.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: `1px solid ${C.border}` }}>📷</div>
        )}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.teal, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.hospital_name}</div>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
            background: `${sc}18`, color: sc, border: `1px solid ${sc}30`,
          }}>{g.workflow_status || "미설정"}</span>
        </div>
      </div>

      {/* 정보 행 */}
      <div style={{ display: "grid", gap: 5, marginBottom: 14 }}>
        {g.contact_name && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.hint, fontWeight: 700, minWidth: 36 }}>담당자</span>
            <span style={{ fontSize: 12, color: C.txt, fontWeight: 600 }}>{g.contact_name}</span>
          </div>
        )}
        {g.shoot_date && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.hint, fontWeight: 700, minWidth: 36 }}>촬영일</span>
            <span style={{ fontSize: 12, color: C.muted }}>{displayDate(g.shoot_date)}</span>
          </div>
        )}
        {g.description && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ fontSize: 10, color: C.hint, fontWeight: 700, minWidth: 36, paddingTop: 1 }}>내용</span>
            <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.description}</span>
          </div>
        )}
      </div>

      {/* 하단 액션 */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <a href={g.nas_link} target="_blank" rel="noreferrer" style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
          borderRadius: 8, background: C.light, color: C.teal, fontSize: 12, fontWeight: 700,
          textDecoration: "none", border: `1px solid ${C.border}`,
        }}>
          <ExternalLink size={11} /> 갤러리
        </a>
        <button onClick={onEdit} style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
          borderRadius: 8, background: C.white, color: C.muted, fontSize: 12, fontWeight: 700,
          border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit",
        }}>
          <Pencil size={11} /> 수정
        </button>
      </div>
    </div>
  );
}

/* ── 폼 패널 ────────────────────────────────────────────────── */
function ClientForm({ form, setForm, editingId, saving, msg, thumbPreview, onSubmit, onCancel, onThumbChange }: {
  form: any; setForm: any; editingId: string; saving: boolean; msg: string;
  thumbPreview: string; onSubmit: (e: FormEvent) => void; onCancel: () => void;
  onThumbChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 기본 정보 카드 */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>기본 정보</div>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>병원명 *</label>
              <input value={form.hospitalName} onChange={e => set("hospitalName", e.target.value)} placeholder="온유성형외과" style={iS} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>촬영일</label>
              <input type="date" value={form.shootDate} onChange={e => set("shootDate", e.target.value)} style={iS} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>담당자</label>
              <input value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="김실장님" style={iS} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>공유 이메일</label>
              <input type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} placeholder="client@hospital.com" style={iS} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>NAS 갤러리 링크 *</label>
            <input value={form.nasLink} onChange={e => set("nasLink", e.target.value)} placeholder="https://nas.photoclinic.kr/share/..." style={iS} required />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6 }}>촬영 내용</label>
            <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="대표원장 프로필, 상담실, 로비 공간 촬영" style={iS} />
          </div>
        </div>
      </div>

      {/* 업무 상태 카드 */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>업무 상태</div>
        </div>
        <div style={{ padding: 20 }}>
          {Object.entries(STATUS_GROUP).map(([group, statuses]) => (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.hint, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>{group}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {statuses.map(s => {
                  const sc = STATUS_COLOR[s] || C.sage;
                  const active = form.workflowStatus === s;
                  return (
                    <button key={s} type="button" onClick={() => set("workflowStatus", s)} style={{
                      padding: "5px 11px", borderRadius: 99, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                      border: `1.5px solid ${active ? sc : C.border}`,
                      background: active ? `${sc}18` : C.white,
                      color: active ? sc : C.muted, fontWeight: active ? 800 : 400,
                      transition: "all .12s",
                    }}>{s}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 대표 이미지 */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>대표 이미지</div>
        <input type="file" accept="image/*" onChange={onThumbChange} style={{ fontSize: 13, color: C.muted }} />
        {thumbPreview && <img src={thumbPreview} alt="" style={{ marginTop: 12, height: 72, borderRadius: 10, border: `1px solid ${C.border}`, display: "block" }} />}
      </div>

      {msg && <div style={{ fontSize: 13, fontWeight: 700, color: msg.includes("실패") ? C.orange : C.teal, padding: "10px 14px", background: msg.includes("실패") ? "#FFF0F0" : C.light, borderRadius: 10 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{
          flex: 1, height: 48, border: "none", borderRadius: 12, background: saving ? C.hint : C.teal,
          color: "#fff", fontWeight: 900, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>
          {saving ? "저장 중..." : editingId ? "✓ 수정 저장" : "✓ 등록"}
        </button>
        <button type="button" onClick={onCancel} style={{
          height: 48, padding: "0 20px", border: `1.5px solid ${C.border}`, borderRadius: 12,
          background: C.white, color: C.muted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>취소</button>
      </div>
    </form>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────────────── */
export default function ClientsPage() {
  const router = useRouter();
  const [galleries, setGalleries]     = useState<Gallery[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState("");
  const [editingId, setEditingId]     = useState("");
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [mailing, setMailing]         = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview]   = useState("");
  const [tab, setTab]                 = useState<"list" | "form">("list");
  const [form, setForm] = useState({
    hospitalName: "", contactName: "", contactEmail: "",
    shootDate: "", nasLink: "", description: "",
    thumbnailUrl: "", workflowStatus: "촬영완료",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/galleries");
      const data = await res.json();
      if (data.ok) setGalleries(data.galleries || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ hospitalName: "", contactName: "", contactEmail: "", shootDate: "", nasLink: "", description: "", thumbnailUrl: "", workflowStatus: "촬영완료" });
    setThumbnailFile(null); setThumbPreview(""); setEditingId(""); setMsg("");
  };

  const startEdit = (g: Gallery) => {
    setForm({ hospitalName: g.hospital_name, contactName: g.contact_name || "", contactEmail: g.contact_email || "", shootDate: g.shoot_date || "", nasLink: g.nas_link, description: g.description || "", thumbnailUrl: g.items?.[0]?.thumbnail_url || "", workflowStatus: g.workflow_status || "촬영완료" });
    setEditingId(g.id); setThumbPreview(g.items?.[0]?.thumbnail_url || ""); setMsg("");
    setTab("form");
  };

  const handleThumbChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setThumbnailFile(f);
    const reader = new FileReader();
    reader.onload = ev => setThumbPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setMsg("");
    try {
      let thumbnailUrl = form.thumbnailUrl;
      if (thumbnailFile) {
        const blob = await compressImage(thumbnailFile);
        const fd = new FormData(); fd.append("file", blob, "thumbnail.webp");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = await uploadRes.json();
        if (uploadData.ok) thumbnailUrl = uploadData.url;
      }
      const url = editingId ? `/api/galleries/${editingId}` : "/api/galleries";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, thumbnailUrl }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "저장 실패");
      setMsg(editingId ? "수정됐습니다." : "등록됐습니다."); resetForm();
      await load(); setTab("list");
    } catch (err: any) {
      setMsg(err.message || "오류가 발생했습니다.");
    } finally { setSaving(false); }
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sendToMailing = async () => {
    setMailing(true);
    try {
      const sel = galleries.filter(g => selected.has(g.id));
      await Promise.all(sel.map(g => createMailingDraft({
        type: "gallery", source_module: "clients",
        hospital_name: g.hospital_name, contact_name: g.contact_name || "",
        to_email: g.contact_email || "",
        subject: `[포토클리닉] ${g.hospital_name} 갤러리가 준비됐습니다`,
        body: `안녕하세요. 포토클리닉 갤러리가 준비됐습니다.\n\n🔗 갤러리 링크: ${g.nas_link}`,
        links: [{ label: "갤러리 보기", url: g.nas_link }],
      })));
      setSelected(new Set());
      router.push("/mailing");
    } finally { setMailing(false); }
  };

  const filtered = galleries.filter(g => {
    const q = search.toLowerCase();
    const matchSearch = !q || g.hospital_name.toLowerCase().includes(q) || (g.contact_name || "").toLowerCase().includes(q);
    const matchStatus = !statusFilter || g.workflow_status === statusFilter;
    return matchSearch && matchStatus;
  });

  /* ── 상태별 카운트 요약 ── */
  const statusCounts = {
    준비: galleries.filter(g => STATUS_GROUP["준비"].includes(g.workflow_status || "")).length,
    제작: galleries.filter(g => STATUS_GROUP["제작"].includes(g.workflow_status || "")).length,
    완료: galleries.filter(g => STATUS_GROUP["완료"].includes(g.workflow_status || "")).length,
  };

  return (
    <div style={{ background: C.bg, color: C.txt }}>

      {/* ── 탭 바 ── */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", gap: 2 }}>
          {[
            { id: "list", label: "클라이언트 목록", icon: Users, count: galleries.length },
            { id: "form", label: editingId ? "정보 수정" : "신규 등록",   icon: Plus },
          ].map(({ id, label, icon: Icon, count }) => (
            <button key={id} onClick={() => { if (id === "list") { resetForm(); } setTab(id as "list" | "form"); }} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "14px 18px",
              border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
              borderBottom: tab === id ? `2.5px solid ${C.teal}` : "2.5px solid transparent",
              color: tab === id ? C.teal : C.muted, fontWeight: tab === id ? 900 : 500, fontSize: 14,
              whiteSpace: "nowrap",
            }}>
              <Icon size={15} />
              {label}
              {count !== undefined && (
                <span style={{ background: tab === id ? C.teal : C.border, color: tab === id ? "#fff" : C.muted, fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 99 }}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 100px" }}>

        {/* ── 목록 탭 ── */}
        {tab === "list" && (
          <>
            {/* 요약 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              {Object.entries(statusCounts).map(([label, count]) => (
                <div key={label} style={{ background: C.white, borderRadius: 12, padding: "14px 18px", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{label} 단계</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: C.teal }}>{count}</span>
                </div>
              ))}
            </div>

            {/* 검색 + 필터 */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.hint }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="병원명 · 담당자 검색" style={{ ...iS, paddingLeft: 34 }} />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...iS, width: "auto", minWidth: 140 }}>
                <option value="">전체 상태</option>
                {WORKFLOW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(search || statusFilter) && (
                <button onClick={() => { setSearch(""); setStatusFilter(""); }} style={{ height: 42, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  초기화
                </button>
              )}
              <button onClick={load} style={{ height: 42, width: 42, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RefreshCw size={14} color={C.teal} />
              </button>
              <span style={{ fontSize: 12, color: C.hint, marginLeft: "auto" }}>총 {filtered.length}건</span>
            </div>

            {/* 카드 그리드 */}
            {loading ? (
              <div style={{ padding: "60px 0", textAlign: "center", color: C.hint }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>불러오는 중...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "60px 0", textAlign: "center", color: C.muted }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>📷</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>등록된 클라이언트가 없어요</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>상단 등록 버튼으로 첫 클라이언트를 추가하세요</div>
                <button onClick={() => setTab("form")} style={{ height: 44, padding: "0 24px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  + 첫 클라이언트 등록
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {filtered.map(g => (
                  <ClientCard key={g.id} g={g} selected={selected.has(g.id)}
                    onSelect={() => toggleSelect(g.id)} onEdit={() => startEdit(g)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── 등록/수정 탭 ── */}
        {tab === "form" && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 6 }}>PHOTO CLINIC</div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.teal }}>{editingId ? "클라이언트 정보 수정" : "신규 클라이언트 등록"}</h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted }}>갤러리 정보와 업무 상태를 등록합니다.</p>
            </div>
            <ClientForm form={form} setForm={setForm} editingId={editingId} saving={saving} msg={msg}
              thumbPreview={thumbPreview} onSubmit={handleSubmit} onCancel={() => { resetForm(); setTab("list"); }}
              onThumbChange={handleThumbChange} />
          </div>
        )}
      </div>

      {/* ── 플로팅 메일링 바 ── */}
      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: 14, background: C.teal,
          borderRadius: 16, padding: "14px 22px", boxShadow: "0 8px 32px rgba(21,88,85,.35)",
          animation: "fadeIn .18s ease", whiteSpace: "nowrap",
        }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{selected.size}개 선택됨</span>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.3)" }} />
          <button onClick={() => setSelected(new Set())} style={{ background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            해제
          </button>
          <button onClick={sendToMailing} disabled={mailing} style={{
            display: "flex", alignItems: "center", gap: 6, background: C.orange, border: "none",
            borderRadius: 8, padding: "6px 18px", color: "#fff", fontSize: 13, fontWeight: 900,
            cursor: mailing ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: mailing ? 0.7 : 1,
          }}>
            <Mail size={14} /> {mailing ? "생성 중..." : "메일링 생성 →"}
          </button>
        </div>
      )}
    </div>
  );
}
