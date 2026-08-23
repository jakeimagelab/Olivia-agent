"use client";

import { useEffect, useState } from "react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";

type DocumentRow = {
  id: string;
  type: OliviaDocumentType;
  title: string;
  clientName?: string | null;
  projectName?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  route?: string | null;
};

// 채팅의 search_documents 도구와 완전히 같은 searchDocuments()를 API 라우트 하나로만 거친다 —
// 여기서 별도 필터/정렬 로직을 만들지 않는다(요청서 7절).
const TYPE_TABS: { value: OliviaDocumentType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "quote", label: "견적" },
  { value: "contract", label: "계약" },
  { value: "storyboard", label: "콘티" },
  { value: "memo", label: "메모" },
  { value: "gallery", label: "갤러리" },
  { value: "other", label: "기타" },
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function DocumentSearchPanel() {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<OliviaDocumentType | "all">("all");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed && activeType === "all") {
      setDocuments([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      if (activeType !== "all") params.set("type", activeType);
      fetch(`/api/documents/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((payload) => {
          setDocuments(payload.ok ? payload.documents : []);
          setHasSearched(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, activeType]);

  return (
    <div className="oa-document-search">
      <div className="oa-document-search__bar">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="고객명, 문서명으로 검색 (예: 히어산부인과, 콘티)"
          className="oa-document-search__input"
        />
      </div>
      <div className="oa-tool-tabs" role="tablist" aria-label="문서 종류">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className="oa-tool-tabs__tab"
            data-active={activeType === tab.value}
            role="tab"
            aria-selected={activeType === tab.value}
            onClick={() => setActiveType(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {hasSearched && (
        <div className="oa-document-table">
          <div className="oa-table-head oa-document-table__row">
            <span>문서명</span>
            <span>고객</span>
            <span>종류</span>
            <span>상태</span>
            <span>수정일</span>
          </div>
          {loading ? (
            <div className="oa-tool-search-empty"><strong>검색하는 중…</strong></div>
          ) : documents.length ? (
            documents.map((doc) => (
              <a key={doc.id} href={doc.route || "#"} className="oa-table-row oa-document-table__row">
                <span className="is-strong">{doc.title}</span>
                <span>{doc.clientName || "-"}</span>
                <span>{TYPE_TABS.find((t) => t.value === doc.type)?.label || doc.type}</span>
                <span>{doc.status || "-"}</span>
                <span>{formatDate(doc.updatedAt)}</span>
              </a>
            ))
          ) : (
            <div className="oa-tool-search-empty"><strong>검색 결과가 없습니다.</strong><p>고객명이나 문서 종류를 다르게 입력해보세요.</p></div>
          )}
        </div>
      )}
    </div>
  );
}
