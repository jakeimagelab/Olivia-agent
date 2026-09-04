"use client";

import { Clapperboard, File, FileSignature, FileText, Images, StickyNote } from "lucide-react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import styles from "./DocumentsWindowContent.module.css";

export type DocumentRow = {
  id: string;
  type: OliviaDocumentType;
  title: string;
  clientName?: string | null;
  projectName?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  route?: string | null;
};

const TYPE_ICON: Record<OliviaDocumentType, React.ComponentType<{ size?: number }>> = {
  quote: FileText,
  contract: FileSignature,
  storyboard: Clapperboard,
  report: FileText,
  checklist: FileText,
  revision: FileText,
  memo: StickyNote,
  project_document: FileText,
  uploaded_file: File,
  gallery: Images,
  other: File,
};

const STATUS_VARIANT: Record<string, string> = {
  완료: "green", 승인: "green", 확정: "green",
  진행중: "orange", 대기: "orange", 검토중: "orange",
  취소: "red", 거절: "red", 반려: "red",
};

function statusVariant(status?: string | null) {
  if (!status) return "gray";
  return STATUS_VARIANT[status] ?? "gray";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// 실제 폴더가 없으므로 projectName(없으면 clientName, 그것도 없으면 "기타") 기준으로 시각적
// 그룹만 만든다 — 평평한 검색 결과 위에 얹은 그룹핑일 뿐, 별도 폴더 데이터를 새로 만들지 않는다.
function groupDocuments(documents: DocumentRow[]) {
  const groups = new Map<string, DocumentRow[]>();
  for (const doc of documents) {
    const key = doc.projectName || doc.clientName || "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }
  return Array.from(groups.entries());
}

export function DocumentsGrid({ documents, loading }: { documents: DocumentRow[]; loading: boolean }) {
  if (loading) {
    return <div className={styles.gridEmpty}>불러오는 중...</div>;
  }
  if (documents.length === 0) {
    return <div className={styles.gridEmpty}>표시할 문서가 없습니다.</div>;
  }

  const groups = groupDocuments(documents);

  return (
    <div className={styles.gridScroll}>
      {groups.map(([groupName, docs]) => (
        <section key={groupName} className={styles.group}>
          <h3 className={styles.groupTitle}>{groupName}</h3>
          <div className={styles.grid}>
            {docs.map((doc) => {
              const Icon = TYPE_ICON[doc.type] ?? File;
              return (
                <a
                  key={doc.id}
                  href={doc.route || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.card}
                >
                  <div className={styles.cardIcon}><Icon size={22} /></div>
                  <div className={styles.cardTitle}>{doc.title}</div>
                  <div className={styles.cardSubtitle}>{doc.clientName || doc.projectName || "-"}</div>
                  <div className={styles.cardFooter}>
                    {doc.status && (
                      <span className={`oa-status-badge oa-status-badge--${statusVariant(doc.status)}`}>
                        {doc.status}
                      </span>
                    )}
                    <span className={styles.cardDate}>{formatDate(doc.updatedAt)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
