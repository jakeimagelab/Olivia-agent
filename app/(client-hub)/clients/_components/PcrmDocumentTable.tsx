"use client";

import { useState } from "react";
import { Download, Eye, FileText, Search } from "lucide-react";
import { C, R } from "@/lib/theme";
import { formatArtifactSize, openWorkflowArtifact, type WorkflowArtifact } from "@/lib/workflowArtifacts";

type DocumentRow = WorkflowArtifact & { hospital_name?: string };

const TYPE_LABEL: Record<string, string> = { quote: "견적서", contract: "계약서", conti: "콘티" };
const TYPE_TABS: { key: "all" | "quote" | "contract" | "conti"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "quote", label: "견적서" },
  { key: "contract", label: "계약서" },
  { key: "conti", label: "콘티" },
];

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
};

export default function PcrmDocumentTable({ documents, loading }: { documents: DocumentRow[]; loading: boolean }) {
  const [tab, setTab] = useState<(typeof TYPE_TABS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = documents.filter((doc) => {
    if (tab !== "all" && doc.document_type !== tab) return false;
    if (!search) return true;
    const haystack = `${doc.hospital_name ?? ""} ${doc.title} ${doc.file_name}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const access = async (doc: DocumentRow, mode: "view" | "download") => {
    setBusyId(doc.id);
    try {
      await openWorkflowArtifact(doc.id, mode);
    } catch (error) {
      alert(error instanceof Error ? error.message : "원본 파일을 열지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>문서 관리</h1>
        </div>
        <div className="pcrm-dashboard-actions">
          <label>
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="병원명 · 파일명 검색" />
          </label>
        </div>
      </div>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>워크플로우 문서 보관함</h2><span>견적서·계약서·콘티 등 진행 문서를 한곳에서 확인하세요.</span></div>
          <b>{filtered.length}건</b>
        </header>
        <div className="pcrm-project-tabs" role="tablist" aria-label="문서 유형 필터">
          {TYPE_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="pcrm-project-table pcrm-document-table">
          <div className="pcrm-project-row pcrm-project-row--head">
            <span>유형</span><span>제목</span><span>고객명</span><span>등록일</span><span>용량</span><span />
          </div>
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <p className="pcrm-empty-copy">등록된 문서가 없습니다.</p>
          ) : filtered.map((doc) => (
            <div key={doc.id} className="pcrm-project-row" style={{ cursor: "default" }}>
              <span><i data-state="active">{TYPE_LABEL[doc.document_type] || doc.document_type}</i></span>
              <span><FileText size={15} />{doc.title || doc.file_name}</span>
              <span>{doc.hospital_name || "—"}</span>
              <span>{formatDate(doc.created_at)}</span>
              <span>{formatArtifactSize(doc.file_size) || "—"}</span>
              <span className="pcrm-row-actions">
                <button type="button" aria-label="보기" disabled={busyId === doc.id} onClick={() => void access(doc, "view")}><Eye size={14} /></button>
                <button type="button" aria-label="다운로드" disabled={busyId === doc.id} onClick={() => void access(doc, "download")}><Download size={14} /></button>
              </span>
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
