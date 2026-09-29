"use client";

import { useState } from "react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import { documentStage, documentStatusLabel, type DocumentStage } from "@/lib/documents/status";
import { getDocumentOpenTarget } from "@/lib/olivia/documents/openDocument";
import { useDesktopAppLauncher } from "../../useDesktopAppLauncher";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import styles from "./DocumentsWindowContent.module.css";
import { CheckCircle2, Clapperboard, File, FileSignature, FileText, Images, MessageSquareQuote, StickyNote } from "lucide-react";

export type DocumentRow = {
  id: string;
  type: OliviaDocumentType;
  title: string;
  clientName?: string | null;
  projectName?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  route?: string | null;
  sourceId?: string;
  metadata?: { temporaryDocumentId?: string; sourceId?: string; sourceTable?: string };
};

const TYPE_ICON: Record<OliviaDocumentType, React.ComponentType<{ size?: number }>> = {
  quote: FileText,
  contract: FileSignature,
  storyboard: Clapperboard,
  report: FileText,
  checklist: FileText,
  revision: FileText,
  memo: StickyNote,
  review: MessageSquareQuote,
  project_document: FileText,
  uploaded_file: File,
  gallery: Images,
  other: File,
};

type DocumentGroup = { key: string; title: string; documents: DocumentRow[]; unlinked: boolean };
type DocumentVersionBundle = { key: string; representative: DocumentRow; previous: DocumentRow[] };

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function updatedTime(document: DocumentRow) {
  const time = document.updatedAt ? Date.parse(document.updatedAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

function groupDocuments(documents: DocumentRow[]): DocumentGroup[] {
  const groups = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    // 버전 묶음의 기준이 고객+제목이므로, 바깥 그룹도 고객 기준으로 맞춘다. 그래야
    // 프로젝트 태그가 다른 같은 고객의 동일 문서가 서로 다른 칸으로 갈라지지 않는다.
    const key = document.clientName?.trim() || "__unlinked__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(document);
  }
  return Array.from(groups.entries())
    .map(([key, docs]) => ({
      key,
      title: key === "__unlinked__" ? `고객 미연결 (${docs.length})` : key,
      documents: docs,
      unlinked: key === "__unlinked__",
    }))
    .sort((a, b) => Number(a.unlinked) - Number(b.unlinked));
}

function versionBundles(documents: DocumentRow[]): DocumentVersionBundle[] {
  const bundles = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    const key = `${document.clientName?.trim().toLocaleLowerCase("ko-KR") || "__unlinked__"}\u0000${document.title.trim().toLocaleLowerCase("ko-KR")}`;
    if (!bundles.has(key)) bundles.set(key, []);
    bundles.get(key)!.push(document);
  }
  return Array.from(bundles.entries())
    .map(([key, docs]) => {
      const sorted = [...docs].sort((a, b) => {
        const stageDifference = Number(documentStage(b.status) === "final") - Number(documentStage(a.status) === "final");
        return stageDifference || updatedTime(b) - updatedTime(a);
      });
      return { key, representative: sorted[0], previous: sorted.slice(1) };
    })
    .sort((a, b) => updatedTime(b.representative) - updatedTime(a.representative));
}

function stageClass(stage: DocumentStage) {
  return stage === "final" ? styles.cardFinal : stage === "review" ? styles.cardReview : styles.cardDraft;
}

function VersionCard({ document, onOpen }: { document: DocumentRow; onOpen: () => void }) {
  const target = getDocumentOpenTarget(document);
  if (!target) return <span className={`${styles.versionCard} ${styles.versionCardDisabled}`}>{formatDate(document.updatedAt)}</span>;
  return <button type="button" className={styles.versionCard} onClick={onOpen}>{formatDate(document.updatedAt)}</button>;
}

export function DocumentsGrid({ documents, loading, surface = "desktop" }: { documents: DocumentRow[]; loading: boolean; surface?: "desktop" | "tablet" }) {
  const launchHref = useDesktopAppLauncher();
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(() => new Set());
  if (loading) return <div className={styles.gridEmpty}>불러오는 중...</div>;
  if (documents.length === 0) return <div className={styles.gridEmpty}>표시할 문서가 없습니다.</div>;

  const groups = groupDocuments(documents);
  const toggleVersions = (key: string) => setExpandedVersions((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className={styles.gridScroll}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <div className={styles.grid}>
            {versionBundles(group.documents).map((bundle) => {
              const document = bundle.representative;
              const Icon = TYPE_ICON[document.type] ?? File;
              const target = getDocumentOpenTarget(document);
              const stage = documentStage(document.status);
              const final = stage === "final";
              const expanded = expandedVersions.has(bundle.key);
              const open = () => {
                if (target) launchHref(target.href, target.title, target.context);
              };
              const cardContents = <>
                {final ? <span className={styles.finalRibbon} aria-label="최종본"><CheckCircle2 size={12} /></span> : null}
                {surface === "tablet" ? <DocumentTypeIcon type={document.type} /> : <div className={styles.cardIcon}><Icon size={22} /></div>}
                <div className={styles.cardTitle}>{document.title}</div>
                <div className={styles.cardSubtitle}>{document.clientName || "고객 미연결"}</div>
                <div className={styles.cardFooter}>
                  <span className={`oa-status-badge ${styles.stageBadge} ${final ? styles.finalBadge : stage === "review" ? styles.reviewBadge : styles.draftBadge}`}>
                    {final ? <CheckCircle2 size={11} aria-hidden="true" /> : null}
                    {final ? "최종본" : documentStatusLabel(document.status)}
                  </span>
                  <span className={styles.cardDate}>{formatDate(document.updatedAt)}</span>
                </div>
              </>;
              return (
                <article key={bundle.key} className={styles.documentStack}>
                  {target ? <a href={target.href} className={`${styles.card} ${stageClass(stage)}`} onClick={(event) => { event.preventDefault(); open(); }}>{cardContents}</a> : <button type="button" className={`${styles.card} ${stageClass(stage)} ${styles.cardDisabled}`} disabled title="이 문서는 아직 직접 열 수 없습니다.">{cardContents}<span className={styles.cardUnavailable}>열기 지원 안 함</span></button>}
                  {!document.clientName ? <button type="button" className={styles.connectClient} onClick={() => {
                    if (target) open();
                    else launchHref("/clients", "고객 관리");
                  }}>고객 연결</button> : null}
                  {bundle.previous.length ? <>
                    <button type="button" className={styles.versionToggle} aria-expanded={expanded} onClick={() => toggleVersions(bundle.key)}>{expanded ? "이전 버전 접기" : `이전 버전 ${bundle.previous.length}개`}</button>
                    {expanded ? <div className={styles.versionList} aria-label={`${document.title} 이전 버전`}>
                      {bundle.previous.map((previous) => <VersionCard key={previous.id} document={previous} onOpen={() => {
                        const previousTarget = getDocumentOpenTarget(previous);
                        if (previousTarget) launchHref(previousTarget.href, previousTarget.title, previousTarget.context);
                      }} />)}
                    </div> : null}
                  </> : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
