"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, X, Eye, Pencil, MoreVertical, HelpCircle, Download, RotateCcw, Plus,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Star, MessageCircle,
  Sparkles, CheckCircle2, PauseCircle, HeartPulse, Leaf, Smile,
} from "lucide-react";
import { C, R } from "@/lib/theme";
import { getReviewContentStageMeta, type ReviewContentStage } from "@/lib/reviews/contentStatusLabel";
import styles from "./PcrmReviewTable.module.css";

export type ReviewRow = {
  id: string;
  client_id: string;
  hospital_name: string;
  reviewer_name: string;
  review_text: string;
  delivered_at?: string | null;
  content_status?: string;
  created_at?: string;
  rating?: number | null;
  photoCount?: number;
};

const STATUS_TABS: { key: "all" | ReviewContentStage; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "not_created", label: "미제작" },
  { key: "in_progress", label: "제작중" },
  { key: "completed", label: "제작완료" },
  { key: "on_hold", label: "보류" },
];

// 병원별 실제 로고 자산이 없어서, 이름을 해시해 고정된 팔레트에서 색+아이콘을 골라
// 목업의 원형 컬러 아이콘과 비슷한 시각적 변주를 준다(의미상 진료과와는 무관).
const AVATAR_PALETTE = [
  { bg: "#EAF4F2", fg: "#155855", Icon: Leaf },
  { bg: "#FDECE3", fg: "#E85D2C", Icon: HeartPulse },
  { bg: "#F3ECFB", fg: "#7C3AED", Icon: Sparkles },
  { bg: "#E7F1FC", fg: "#2563EB", Icon: Eye },
  { bg: "#FFF6DE", fg: "#B4690E", Icon: Smile },
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
function avatarFor(name: string) { return AVATAR_PALETTE[hashString(name || "?") % AVATAR_PALETTE.length]; }

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateOf(row: ReviewRow) {
  const value = row.delivered_at || row.created_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
}

function buildPageList(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

type Props = {
  reviews: ReviewRow[];
  loading: boolean;
  onRegister: (input: { hospitalName: string; reviewText: string; reviewerName: string; rating: number }) => Promise<void>;
  onEdit: (id: string, patch: { reviewText?: string; reviewerName?: string; contentStatus?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function PcrmReviewTable({ reviews, loading, onRegister, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [photoFilter, setPhotoFilter] = useState<"all" | "none" | "has">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReviewRow | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [registering, setRegistering] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hospitals = useMemo(() => Array.from(new Set(reviews.map((row) => row.hospital_name).filter(Boolean))).sort(), [reviews]);

  const filtered = useMemo(() => {
    const rows = reviews.filter((row) => {
      if (tab !== "all" && getReviewContentStageMeta(row).stage !== tab) return false;
      if (hospitalFilter !== "all" && row.hospital_name !== hospitalFilter) return false;
      if (photoFilter !== "all") {
        const count = row.photoCount || 0;
        if (photoFilter === "none" && count > 0) return false;
        if (photoFilter === "has" && count === 0) return false;
      }
      if (dateFilter !== "all") {
        const days = dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        if (dateOf(row) < cutoff) return false;
      }
      if (search) {
        const haystack = `${row.hospital_name} ${row.reviewer_name} ${row.review_text}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    return rows.sort((a, b) => (sort === "newest" ? dateOf(b).getTime() - dateOf(a).getTime() : dateOf(a).getTime() - dateOf(b).getTime()));
  }, [reviews, tab, hospitalFilter, photoFilter, dateFilter, search, sort]);

  useEffect(() => { setPage(1); }, [tab, hospitalFilter, photoFilter, dateFilter, search, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const totalCount = reviews.length;
  const thisMonthCount = reviews.filter((row) => dateOf(row) >= thisMonthStart).length;
  const lastMonthCount = reviews.filter((row) => dateOf(row) >= lastMonthStart && dateOf(row) < thisMonthStart).length;
  const monthDelta = lastMonthCount ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100) : (thisMonthCount ? 100 : 0);
  const completedCount = reviews.filter((row) => getReviewContentStageMeta(row).stage === "completed").length;
  const completedPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const onHoldCount = reviews.filter((row) => getReviewContentStageMeta(row).stage === "on_hold").length;

  const stageCount = (stage: (typeof STATUS_TABS)[number]["key"]) => (
    stage === "all" ? reviews.length : reviews.filter((row) => getReviewContentStageMeta(row).stage === stage).length
  );

  const resetFilters = () => {
    setSearch(""); setTab("all"); setHospitalFilter("all"); setDateFilter("all"); setPhotoFilter("all"); setSort("newest");
  };

  const handleDelete = async (row: ReviewRow) => {
    if (!window.confirm(`"${row.hospital_name}" 리뷰를 휴지통으로 이동할까요?`)) return;
    setBusyId(row.id);
    try { await onDelete(row.id); } finally { setBusyId(null); setMenuId(null); }
  };

  const handleHold = async (row: ReviewRow) => {
    const meta = getReviewContentStageMeta(row);
    const nextStatus = meta.stage === "on_hold" ? "unused" : "excluded";
    setBusyId(row.id);
    try { await onEdit(row.id, { contentStatus: nextStatus }); } finally { setBusyId(null); setMenuId(null); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>리뷰 콘텐츠</h1>
          <p className={styles.subtitle}>고객이 남겨주신 리뷰를 관리하고, 콘텐츠로 제작하기 전 데이터를 정리하는 공간입니다.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.ghostButton} onClick={() => setShowGuide((value) => !value)}>
            <HelpCircle size={14} /> 이용 가이드
          </button>
          {showGuide ? (
            <div className={styles.guidePopover}>
              <h4>리뷰 콘텐츠 사용법</h4>
              <ol>
                <li>받은 리뷰를 목록에서 확인하고 검색·필터로 정리하세요.</li>
                <li>[콘텐츠 만들기]를 누르면 상세 화면 없이 바로 제작 화면으로 이동합니다.</li>
                <li>당장 쓰지 않을 리뷰는 ⋮ 메뉴에서 보류로 표시해 두세요.</li>
              </ol>
            </div>
          ) : null}
          <button type="button" className={styles.primaryButton} onClick={() => setRegistering(true)}>
            <Download size={14} /> 리뷰 가져오기
          </button>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <SummaryCard icon={<MessageCircle size={19} />} iconBg="#EAF4F2" iconFg="#155855" label="전체 리뷰 수" value={`${totalCount.toLocaleString()}건`} />
        <SummaryCard
          icon={<Sparkles size={19} />} iconBg="#FFF3E0" iconFg="#B4690E" label="이번 달 신규"
          value={`${thisMonthCount.toLocaleString()}건`}
          sub={monthDelta === 0 ? undefined : `전월 대비 ${monthDelta > 0 ? "▲" : "▼"} ${Math.abs(monthDelta)}%`}
          subUp={monthDelta > 0}
        />
        <SummaryCard icon={<CheckCircle2 size={19} />} iconBg="#EAF4F2" iconFg="#155855" label="콘텐츠 제작 완료" value={`${completedCount.toLocaleString()}건`} sub={`전체 대비 ${completedPct}%`} />
        <SummaryCard icon={<PauseCircle size={19} />} iconBg="#F3ECFB" iconFg="#7C3AED" label="보류 중" value={`${onHoldCount.toLocaleString()}건`} sub="검토 필요" />
      </div>

      <div className={styles.filterBar}>
        <label className={styles.searchField}>
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="병원명, 원장명, 리뷰 내용을 검색하세요" />
        </label>
        <select className={styles.filterSelect} value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
          <option value="all">리뷰 등록일 전체</option>
          <option value="7d">최근 7일</option>
          <option value="30d">최근 30일</option>
          <option value="90d">최근 90일</option>
        </select>
        <select className={styles.filterSelect} value={hospitalFilter} onChange={(event) => setHospitalFilter(event.target.value)}>
          <option value="all">전체 병원</option>
          {hospitals.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className={styles.filterSelect} value={tab} onChange={(event) => setTab(event.target.value as typeof tab)}>
          {STATUS_TABS.map((item) => <option key={item.key} value={item.key}>{item.key === "all" ? "전체 상태" : item.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value as typeof photoFilter)}>
          <option value="all">사진 수 전체</option>
          <option value="has">사진 있음</option>
          <option value="none">사진 없음</option>
        </select>
        <button type="button" className={styles.resetButton} onClick={resetFilters}><RotateCcw size={12} /> 필터 초기화</button>
      </div>

      <div className={styles.panel}>
        <div className={styles.tabsRow}>
          <div className={styles.tabs} role="tablist" aria-label="콘텐츠 제작 상태 필터">
            {STATUS_TABS.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`${styles.tab} ${tab === item.key ? styles.tabActive : ""}`} onClick={() => setTab(item.key)}>
                {item.label} {stageCount(item.key)}
              </button>
            ))}
          </div>
          <select className={styles.sortSelect} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="newest">최신 등록일 순</option>
            <option value="oldest">오래된 등록일 순</option>
          </select>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {["병원명", "원장명", "리뷰 요약", "리뷰 등록일", "사진 수", "상태", "작업"].map((label) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => <SkeletonRow key={index} />)
              ) : reviews.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className={styles.emptyState}>
                    <span>등록된 리뷰가 없습니다.</span>
                    <button type="button" className={styles.primaryButton} onClick={() => setRegistering(true)}><Plus size={14} /> 리뷰 등록</button>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7}><div className={styles.emptyState}>검색·필터 조건에 맞는 리뷰가 없습니다.</div></td></tr>
              ) : pageRows.map((row) => {
                const meta = getReviewContentStageMeta(row);
                const avatar = avatarFor(row.hospital_name);
                const AvatarIcon = avatar.Icon;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className={styles.hospitalCell}>
                        <span className={styles.hospitalIcon} style={{ background: avatar.bg, color: avatar.fg }}><AvatarIcon size={15} /></span>
                        <span className={styles.hospitalName}>{row.hospital_name}</span>
                      </div>
                    </td>
                    <td className={styles.muted}>{row.reviewer_name || "—"}</td>
                    <td className={styles.reviewSummary}>{row.review_text || "—"}</td>
                    <td className={styles.dateCell}>{formatDate(row.delivered_at || row.created_at)}</td>
                    <td className={styles.photoCell}>{row.photoCount || 0}</td>
                    <td><span className={styles.statusBadge} style={{ color: meta.text, background: meta.bg }}>{meta.label}</span></td>
                    <td>
                      <div className={styles.actionsCell}>
                        <button type="button" className={styles.iconAction} aria-label="보기" onClick={() => setViewing(row)}><Eye size={14} /></button>
                        <button type="button" className={styles.iconAction} aria-label="수정" onClick={() => setEditing(row)}><Pencil size={13} /></button>
                        <Link href={`/review-studio?reviewId=${row.id}`} className={`${styles.ctaButton} ${meta.stage === "not_created" ? styles.ctaButtonSolid : ""}`}>
                          {meta.stage === "not_created" ? "콘텐츠 만들기" : "콘텐츠 열기"}
                        </Link>
                        <button type="button" className={styles.iconAction} aria-label="더보기" onClick={() => setMenuId((current) => current === row.id ? null : row.id)}><MoreVertical size={14} /></button>
                        {menuId === row.id ? (
                          <div className={styles.rowMenu}>
                            <button type="button" onClick={() => { setEditing(row); setMenuId(null); }}>수정</button>
                            <button type="button" disabled={busyId === row.id} onClick={() => void handleHold(row)}>{meta.stage === "on_hold" ? "보류 해제" : "보류"}</button>
                            <button type="button" className={styles.rowMenuDanger} disabled={busyId === row.id} onClick={() => void handleDelete(row)}>{busyId === row.id ? "삭제 중..." : "삭제"}</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 ? (
          <div className={styles.paginationRow}>
            <div className={styles.paginationInfo}>
              <span>전체 {filtered.length.toLocaleString()}건</span>
              <select className={styles.pageSizeSelect} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value={20}>20개씩 보기</option>
                <option value={50}>50개씩 보기</option>
                <option value={100}>100개씩 보기</option>
              </select>
            </div>
            <div className={styles.pager}>
              <button type="button" className={styles.pageButton} disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft size={13} /></button>
              <button type="button" className={styles.pageButton} disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={13} /></button>
              {buildPageList(currentPage, totalPages).map((item, index) => item === "..." ? (
                <span key={`ellipsis-${index}`} className={styles.pageEllipsis}>…</span>
              ) : (
                <button key={item} type="button" className={`${styles.pageButton} ${item === currentPage ? styles.pageButtonActive : ""}`} onClick={() => setPage(item)}>{item}</button>
              ))}
              <button type="button" className={styles.pageButton} disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight size={13} /></button>
              <button type="button" className={styles.pageButton} disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight size={13} /></button>
            </div>
          </div>
        ) : null}
      </div>

      {viewing ? <ViewReviewModal review={viewing} onClose={() => setViewing(null)} /> : null}
      {editing ? (
        <EditReviewModal
          review={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { await onEdit(editing.id, patch); setEditing(null); }}
        />
      ) : null}
      {registering ? (
        <RegisterReviewModal
          onClose={() => setRegistering(false)}
          onSave={async (input) => { await onRegister(input); setRegistering(false); }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({ icon, iconBg, iconFg, label, value, sub, subUp }: {
  icon: React.ReactNode; iconBg: string; iconFg: string; label: string; value: string; sub?: string; subUp?: boolean;
}) {
  return (
    <div className={styles.summaryCard}>
      <span className={styles.summaryIcon} style={{ background: iconBg, color: iconFg }}>{icon}</span>
      <div className={styles.summaryBody}>
        <p className={styles.summaryLabel}>{label}</p>
        <p className={styles.summaryValue}>{value}</p>
        {sub ? <p className={`${styles.summarySub} ${subUp ? styles.summarySubUp : ""}`}>{sub}</p> : null}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, index) => (
        <td key={index}><div className={styles.skeletonCell} style={{ width: index === 2 ? "90%" : index === 0 ? 140 : 60 }} /></td>
      ))}
    </tr>
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

function ViewReviewModal({ review, onClose }: { review: ReviewRow; onClose: () => void }) {
  const meta = getReviewContentStageMeta(review);
  return (
    <ModalShell title="리뷰 보기" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14, color: C.ink }}>{review.hospital_name}</strong>
          <span style={{ padding: "3px 10px", borderRadius: R.full, fontSize: 11, fontWeight: 800, color: meta.text, background: meta.bg }}>{meta.label}</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>{review.reviewer_name || "—"} · {formatDate(review.delivered_at || review.created_at)}</div>
        {review.rating ? (
          <div style={{ display: "flex", gap: 2, color: "#EB8F22" }}>
            {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={14} fill={index < Math.round(review.rating || 0) ? "#EB8F22" : "none"} />)}
          </div>
        ) : null}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap" }}>{review.review_text || "내용이 없습니다."}</p>
      </div>
    </ModalShell>
  );
}

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
