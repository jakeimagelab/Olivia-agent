"use client";

import { useEffect, useState } from "react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import { DocumentsSidebar, type DocumentCategory } from "./DocumentsSidebar";
import { DocumentsGrid, type DocumentRow } from "./DocumentsGrid";
import styles from "./DocumentsWindowContent.module.css";

// 실제 폴더/파일 시스템은 이 코드베이스에 없다 — /api/documents/search가 주는 건 고객/프로젝트
// 태그가 붙은 평평한(flat) 문서 목록뿐이다. 가짜 폴더 백엔드를 만드는 대신, 이 평평한 데이터를
// 프로젝트별로 그룹핑해서 파인더처럼 "보이게"만 한다(DocumentsGrid.tsx의 groupBy).
// DocumentSearchPanel.tsx와 같은 엔드포인트/디바운스 패턴을 그대로 재사용한다 — 새 API 없음.
export function DocumentsWindowContent() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("all");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      if (category !== "all") params.set("type", category as OliviaDocumentType);
      // DocumentSearchPanel과 달리 파인더 창은 열자마자 목록이 채워져 있어야 한다(빈 화면으로
      // 시작하지 않음) — 쿼리 없이도 항상 호출한다(searchDocuments 기본값에 맡김).
      fetch(`/api/documents/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((payload) => setDocuments(payload.ok ? payload.documents : []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, category]);

  return (
    <div className={styles.root}>
      <DocumentsSidebar query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} />
      <DocumentsGrid documents={documents} loading={loading} />
    </div>
  );
}
