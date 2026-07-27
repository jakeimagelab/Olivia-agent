"use client";

import { useState } from "react";
import { PenLine, Search } from "lucide-react";
import { C, R } from "@/lib/theme";

type RevisionRow = {
  id: string;
  client_id: string;
  request_type: string;
  title: string;
  content: string;
  related_file?: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "requested" | "in_progress" | "completed" | "rejected";
  admin_reply?: string;
  created_at: string;
  clients?: { hospital_name: string };
};

const STATUS_TABS: { key: "all" | RevisionRow["status"]; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "requested", label: "대기" },
  { key: "in_progress", label: "처리 중" },
  { key: "completed", label: "완료" },
  { key: "rejected", label: "거절" },
];

const STATUS_LABEL: Record<RevisionRow["status"], string> = {
  requested: "대기", in_progress: "처리 중", completed: "완료", rejected: "거절",
};
const PRIORITY_LABEL: Record<RevisionRow["priority"], string> = {
  low: "낮음", normal: "보통", high: "높음", urgent: "긴급",
};

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
};

type Props = {
  revisions: RevisionRow[];
  loading: boolean;
  onUpdate: (id: string, patch: { status?: RevisionRow["status"]; adminReply?: string }) => Promise<void>;
};

export default function PcrmRevisionTable({ revisions, loading, onUpdate }: Props) {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = revisions.filter((row) => {
    if (tab !== "all" && row.status !== tab) return false;
    if (!search) return true;
    const haystack = `${row.clients?.hospital_name ?? ""} ${row.title} ${row.content}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const toggleOpen = (row: RevisionRow) => {
    if (openId === row.id) { setOpenId(null); return; }
    setOpenId(row.id);
    setReplyDraft(row.admin_reply || "");
  };

  const changeStatus = async (row: RevisionRow, status: RevisionRow["status"]) => {
    setSavingId(row.id);
    try { await onUpdate(row.id, { status }); } finally { setSavingId(null); }
  };

  const saveReply = async (row: RevisionRow) => {
    setSavingId(row.id);
    try {
      await onUpdate(row.id, { adminReply: replyDraft, status: row.status === "requested" ? "in_progress" : row.status });
      setOpenId(null);
    } finally { setSavingId(null); }
  };

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>수정 요청 관리</h1>
        </div>
        <div className="pcrm-dashboard-actions">
          <label>
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="병원명 · 제목 검색" />
          </label>
        </div>
      </div>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>고객 수정 요청</h2><span>전체 고객의 수정 요청을 확인하고 답변하세요.</span></div>
          <b>{filtered.length}건</b>
        </header>
        <div className="pcrm-project-tabs" role="tablist" aria-label="수정 요청 상태 필터">
          {STATUS_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="pcrm-revision-list">
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="pcrm-empty-copy">수정 요청이 없습니다.</p>
          ) : filtered.map((row) => (
            <div key={row.id} className="pcrm-revision-item">
              <button type="button" className="pcrm-revision-summary" onClick={() => toggleOpen(row)}>
                <span className={`pcrm-revision-priority pcrm-revision-priority--${row.priority}`}>{PRIORITY_LABEL[row.priority]}</span>
                <span className="pcrm-revision-title"><PenLine size={14} />{row.title}<small>{row.clients?.hospital_name || "—"}</small></span>
                <select
                  value={row.status}
                  disabled={savingId === row.id}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => void changeStatus(row, event.target.value as RevisionRow["status"])}
                >
                  {(Object.keys(STATUS_LABEL) as RevisionRow["status"][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <small className="pcrm-revision-date">{formatDate(row.created_at)}</small>
              </button>
              {openId === row.id && (
                <div className="pcrm-revision-detail">
                  <p>{row.content || "요청 내용이 없습니다."}</p>
                  <textarea
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="답변을 입력하세요."
                    rows={3}
                  />
                  <div className="pcrm-revision-detail__actions">
                    <button type="button" disabled={savingId === row.id} onClick={() => void saveReply(row)}>
                      {savingId === row.id ? "저장 중..." : "답변 저장"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
