"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GALLERY_STATUS_COLOR, GALLERY_STATUS_LABEL, type SelectGallery } from "@/lib/selectGallery";

const C = {
  teal: "#155855", bg: "#F0F9F8", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", green: "#22876A", red: "#DC2626",
};

export default function SelectGalleriesPage() {
  const [galleries, setGalleries] = useState<SelectGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", hospital_name: "", shooting_name: "", shooting_date: "", expire_days: 3 });
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/select-galleries").then(r => r.json()).then(d => {
      if (d.ok) setGalleries(d.galleries);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title) return;
    setCreating(true);
    const res = await fetch("/api/select-galleries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setCreating(false);
    if (d.ok) { setShowForm(false); setForm({ title: "", hospital_name: "", shooting_name: "", shooting_date: "", expire_days: 3 }); load(); }
    else alert("오류: " + d.error);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.teal, marginBottom: 4 }}>📸 고객 셀렉 갤러리</div>
          <div style={{ fontSize: 13, color: C.muted }}>고객에게 원본 확인 링크를 보내고 RAW 매칭까지 처리합니다</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: C.teal, color: C.white, border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          + 새 갤러리
        </button>
      </div>

      {showForm && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.teal, marginBottom: 16 }}>새 셀렉 갤러리 만들기</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              ["title", "갤러리 제목 *", "예: 정연호 원장 2026년 6월 촬영"],
              ["hospital_name", "병원명", "예: 피부과 클리닉"],
              ["shooting_name", "촬영명", "예: 2026년 프로필 촬영"],
              ["shooting_date", "촬영일", ""],
            ].map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>{label}</label>
                <input type={key === "shooting_date" ? "date" : "text"}
                  value={(form as any)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4 }}>파일 보관 기간</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[3, 5, 7].map(d => (
                <button key={d} onClick={() => setForm(p => ({ ...p, expire_days: d }))}
                  style={{ padding: "6px 16px", borderRadius: 6, border: `1.5px solid ${form.expire_days === d ? C.teal : C.border}`, background: form.expire_days === d ? C.teal : "transparent", color: form.expire_days === d ? C.white : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={create} disabled={!form.title || creating}
              style={{ background: C.teal, color: C.white, border: "none", padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: form.title ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: form.title ? 1 : 0.5 }}>
              {creating ? "생성 중..." : "갤러리 생성"}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              취소
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>불러오는 중...</div>
      ) : galleries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>
          아직 생성된 갤러리가 없습니다.<br />
          <span style={{ fontSize: 12 }}>위에서 새 갤러리를 만들어보세요.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {galleries.map(g => (
            <Link key={g.id} href={`/select-galleries/${g.id}`}
              style={{ textDecoration: "none", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, transition: "box-shadow .15s" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.txt, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.shooting_name ?? g.title}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
                  {g.hospital_name && <span>🏥 {g.hospital_name}</span>}
                  {g.shooting_date && <span>📅 {g.shooting_date}</span>}
                  <span>📸 {g.total_jpg_count}장</span>
                  {g.selected_count > 0 && <span>✅ {g.selected_count}장 선택</span>}
                  <span>📁 만료: {new Date(g.file_expires_at).toLocaleDateString("ko-KR")}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: GALLERY_STATUS_COLOR[g.status] + "20", color: GALLERY_STATUS_COLOR[g.status] }}>
                  {GALLERY_STATUS_LABEL[g.status]}
                </span>
                <span style={{ fontSize: 11, color: C.hint }}>
                  {new Date(g.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
