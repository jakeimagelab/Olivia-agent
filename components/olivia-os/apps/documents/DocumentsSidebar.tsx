"use client";

import { Search } from "lucide-react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import { DOCUMENT_TYPE_LABELS } from "@/lib/olivia/documents/types";
import styles from "./DocumentsWindowContent.module.css";

export type DocumentCategory = OliviaDocumentType | "all";

// /api/documents/search가 실제로 채워주는 타입만 골랐다(searchDocuments.ts의
// ALL_SEARCHABLE_TYPES) — 결과가 절대 안 나오는 카테고리를 사이드바에 두지 않는다.
const CATEGORIES: DocumentCategory[] = ["all", "quote", "contract", "storyboard", "memo", "gallery"];

function categoryLabel(category: DocumentCategory) {
  return category === "all" ? "전체" : DOCUMENT_TYPE_LABELS[category];
}

export function DocumentsSidebar({
  query, onQueryChange, category, onCategoryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  category: DocumentCategory;
  onCategoryChange: (value: DocumentCategory) => void;
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
