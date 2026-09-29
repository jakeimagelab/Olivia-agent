"use client";

import { Search } from "lucide-react";
import type { DocumentStage } from "@/lib/documents/status";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/olivia/documents/types";
import styles from "./DocumentsWindowContent.module.css";

export type DocumentCategory = OliviaDocumentType | "temporary" | "all";
export type DocumentStageFilter = DocumentStage | "all";

// /api/documents/search가 실제로 채워주는 타입만 골랐다(searchDocuments.ts의
// ALL_SEARCHABLE_TYPES) — 결과가 절대 안 나오는 카테고리를 사이드바에 두지 않는다.
const CATEGORIES: DocumentCategory[] = ["all", "temporary", "quote", "contract", "storyboard", "memo", "review", "gallery"];

function categoryLabel(category: DocumentCategory) {
  if (category === "all") return "전체";
  if (category === "temporary") return "임시문서";
  return DOCUMENT_TYPE_LABELS[category];
}

export function DocumentsSidebar({
  query, onQueryChange, category, onCategoryChange, stage, onStageChange, stageCounts,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  category: DocumentCategory;
  onCategoryChange: (value: DocumentCategory) => void;
  stage: DocumentStageFilter;
  onStageChange: (value: DocumentStageFilter) => void;
  stageCounts: Record<DocumentStage, number>;
}) {
  return (
    <div className={styles.sidebar}>
      <div className={styles.searchBox}>
        <Search size={13} className={styles.searchIcon} />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="문서 검색"
          className={styles.searchInput}
        />
      </div>
      <div className={styles.stageFilters} role="tablist" aria-label="문서 단계">
        {([
          ["all", "전체", stageCounts.draft + stageCounts.review + stageCounts.final],
          ["final", "최종본", stageCounts.final],
          ["draft", "작성 중", stageCounts.draft],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={stage === value}
            className={`${styles.stageFilter} ${stage === value ? styles.stageFilterActive : ""}`}
            onClick={() => onStageChange(value)}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </div>
      <div className={styles.categoryList} role="tablist" aria-label="문서 카테고리">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={category === value}
            className={`${styles.categoryItem} ${category === value ? styles.categoryItemActive : ""}`}
            onClick={() => onCategoryChange(value)}
          >
            {categoryLabel(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
