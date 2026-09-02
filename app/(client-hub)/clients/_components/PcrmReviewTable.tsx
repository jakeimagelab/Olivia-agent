"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, MoreVertical, X } from "lucide-react";
import { C, R } from "@/lib/theme";
import { getReviewContentStageMeta, type ReviewContentStage } from "@/lib/reviews/contentStatusLabel";

export type ReviewRow = {
  id: string;
  client_id: string;
  hospital_name: string;
  reviewer_name: string;
  review_text: string;
  delivered_at?: string | null;
  content_status?: string;
  created_at?: string;
};

const STATUS_TABS: { key: "all" | ReviewContentStage; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "not_created", label: "미제작" },
  { key: "in_progress", label: "제작중" },
  { key: "completed", label: "제작완료" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
  overflow: "hidden",
};

type Props = {
  reviews: ReviewRow[];
  loading: boolean;
  onRegister: (input: { hospitalName: string; reviewText: string; reviewerName: string; rating: number }) => Promise<void>;
  onEdit: (id: string, patch: { reviewText?: string; reviewerName?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function PcrmReviewTable({ reviews, loading, onRegister, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [registering, setRegistering] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => reviews.filter((row) => {
    if (tab !== "all" && getReviewContentStageMeta(row).stage !== tab) return false;
    if (!search) return true;
    const haystack = `${row.hospital_name} ${row.reviewer_name} ${row.review_text}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [reviews, tab, search]);

  const handleDelete = async (row: ReviewRow) => {
    if (!window.confirm(`"${row.hospital_name}" 리뷰를 휴지통으로 이동할까요?`)) return;
    setBusyId(row.id);
    try { await onDelete(row.id); } finally { setBusyId(null); setMenuId(null); }
  };

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>리뷰 관리</h1>
        </div>
        <div className="pcrm-dashboard-actions">
          <label>
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="병원명 · 원장명 · 리뷰 내용 검색" />
          </label>
          <button
            type="button"
            onClick={() => setRegistering(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: R.md,
              border: "none", background: C.teal, color: C.white, fontSize: 12.5, fontWeight: 800, cursor: "pointer",
            }}
          >
            <Plus size={15} /> 리뷰 등록
          </button>
        </div>
      </div>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>받은 리뷰</h2><span>받은 리뷰를 관리하고, 콘텐츠 제작으로 연결합니다.</span></div>
          <b>{filtered.length}건</b>
        </header>
        <div className="pcrm-project-tabs" role="tablist" aria-label="콘텐츠 제작 상태 필터">
          {STATUS_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted, textAlign: "left" }}>
                {["번호", "병원명", "원장명", "리뷰 내용", "작성일", "상태", "작업", ""].map((label) => (
                  <th key={label} style={{ padding: "10px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "32px 14px", textAlign: "center", color: C.hint }}>불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "32px 14px", textAlign: "center", color: C.hint }}>표시할 리뷰가 없습니다.</td></tr>
              ) : filtered.map((row, index) => {
                const meta = getReviewContentStageMeta(row);
                return (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 14px", color: C.hint }}>{filtered.length - index}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: C.ink }}>{row.hospital_name}</td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{row.reviewer_name || "—"}</td>
                    <td style={{ padding: "10px 14px", color: C.muted, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.review_text || "—"}</td>
                    <td style={{ padding: "10px 14px", color: C.muted, whiteSpace: "nowrap" }}>{formatDate(row.delivered_at || row.created_at)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: R.full,
                        fontSize: 11, fontWeight: 800, color: meta.text, background: meta.bg,
                      }}>{meta.label}</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Link
                        href={`/review-studio?reviewId=${row.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: R.sm,
                          border: `1.5px solid ${C.teal}`, color: C.teal, background: "transparent",
                          fontSize: 11.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap",
                        }}
                      >
                        {meta.stage === "not_created" ? "콘텐츠 만들기" : "콘텐츠 열기"}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 14px", position: "relative" }}>
                      <button
                        type="button"
                        onClick={() => setMenuId((current) => current === row.id ? null : row.id)}
                        aria-label="더보기"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.hint, display: "flex", padding: 4 }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuId === row.id && (
                        <div style={{
                          position: "absolute", right: 14, top: "100%", zIndex: 20, minWidth: 100,
                          background: C.white, border: `1px solid ${C.border}`, borderRadius: R.sm,
                          boxShadow: "0 10px 28px rgba(21,88,85,.12)", overflow: "hidden",
                        }}>
                          <button
                            type="button"
                            onClick={() => { setEditing(row); setMenuId(null); }}
                            style={{ display: "block", width: "100%", padding: "9px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.ink }}
                          >수정</button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void handleDelete(row)}
                            style={{ display: "block", width: "100%", padding: "9px 14px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.danger }}
                          >{busyId === row.id ? "삭제 중..." : "삭제"}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EditReviewModal
          review={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { await onEdit(editing.id, patch); setEditing(null); }}
        />
      )}
      {registering && (
        <RegisterReviewModal
          onClose={() => setRegistering(false)}
          onSave={async (input) => { await onRegister(input); setRegistering(false); }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(21,43,40,.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{ width: "min(420px, 100%)", background: C.white, borderRadius: R.xl, padding: 22, boxShadow: "0 24px 60px rgba(21,43,40,.24)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: C.ink }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.hint, display: "flex" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: R.sm,
  padding: "9px 11px", outline: "none", background: "#FAFAFA", color: C.ink, fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5 };

function EditReviewModal({ review, onClose, onSave }: { review: ReviewRow; onClose: () => void; onSave: (patch: { reviewText?: string; reviewerName?: string }) => Promise<void> }) {
  const [reviewText, setReviewText] = useState(review.review_text);
  const [reviewerName, setReviewerName] = useState(review.reviewer_name);
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title="리뷰 수정" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div><label style={labelStyle}>원장명</label><input style={fieldStyle} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></div>
        <div><label style={labelStyle}>리뷰 내용</label><textarea style={{ ...fieldStyle, resize: "vertical" }} rows={4} value={reviewText} onChange={(event) => setReviewText(event.target.value)} /></div>
        <button
          type="button"
          disabled={saving || !reviewText.trim()}
          onClick={async () => { setSaving(true); try { await onSave({ reviewText, reviewerName }); } finally { setSaving(false); } }}
          style={{ padding: "10px 14px", borderRadius: R.md, border: "none", background: C.teal, color: C.white, fontSize: 13, fontWeight: 800, cursor: "pointer" }}
        >{saving ? "저장 중..." : "저장"}</button>
      </div>
    </ModalShell>
  );
}

function RegisterReviewModal({ onClose, onSave }: { onClose: () => void; onSave: (input: { hospitalName: string; reviewText: string; reviewerName: string; rating: number }) => Promise<void> }) {
  const [hospitalName, setHospitalName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canSave = hospitalName.trim() && reviewText.trim();
  return (
    <ModalShell title="리뷰 등록" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div><label style={labelStyle}>병원명</label><input style={fieldStyle} value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="예) 라움피부과" /></div>
        <div><label style={labelStyle}>원장명</label><input style={fieldStyle} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></div>
        <div><label style={labelStyle}>리뷰 내용</label><textarea style={{ ...fieldStyle, resize: "vertical" }} rows={4} value={reviewText} onChange={(event) => setReviewText(event.target.value)} /></div>
        <div>
          <label style={labelStyle}>만족도</label>
          <select style={fieldStyle} value={rating} onChange={(event) => setRating(Number(event.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}점</option>)}
          </select>
        </div>
        {error && <div style={{ fontSize: 11.5, color: C.danger }}>{error}</div>}
        <button
          type="button"
          disabled={saving || !canSave}
          onClick={async () => {
            setSaving(true); setError("");
            try { await onSave({ hospitalName, reviewText, reviewerName, rating }); }
            catch (saveError) { setError(saveError instanceof Error ? saveError.message : "등록하지 못했습니다."); }
            finally { setSaving(false); }
          }}
          style={{ padding: "10px 14px", borderRadius: R.md, border: "none", background: C.teal, color: C.white, fontSize: 13, fontWeight: 800, cursor: canSave ? "pointer" : "not-allowed", opacity: canSave ? 1 : 0.6 }}
        >{saving ? "등록 중..." : "등록"}</button>
      </div>
    </ModalShell>
  );
}
