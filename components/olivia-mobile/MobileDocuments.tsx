"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FileArchive, FileImage, FileSignature, FileText, Search } from "lucide-react";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import {
  formatMobileWon,
  normalizeContractResource,
  normalizeMobileDocument,
  normalizeQuoteResource,
  type MobileResource,
} from "@/lib/olivia/mobile/resources";
import MobileHeader from "./MobileHeader";
import styles from "./OliviaMobileShell.module.css";

export type MobileDocumentsSection = "quote-contract" | "library";
type DocumentFilter = "all" | "quote" | "contract";
type LibraryFolder = "all" | "quote" | "contract" | "original" | "retouched" | "client" | "studio";

type RawDocument = Record<string, unknown>;

function documentMetadata(row: RawDocument) {
  return row.metadata && typeof row.metadata === "object"
    ? row.metadata as RawDocument
    : {};
}

const FOLDERS: Array<{ id: Exclude<LibraryFolder, "all">; label: string; Icon: typeof FileText }> = [
  { id: "quote", label: "견적서", Icon: FileText },
  { id: "contract", label: "계약서", Icon: FileSignature },
  { id: "original", label: "촬영 원본", Icon: FileImage },
  { id: "retouched", label: "보정본", Icon: FileImage },
  { id: "client", label: "고객 자료", Icon: FileArchive },
  { id: "studio", label: "스튜디오 자료", Icon: FileArchive },
];

function documentMatchesFolder(row: RawDocument, folder: LibraryFolder) {
  if (folder === "all") return true;
  if (folder === "quote" || folder === "contract") return row.type === folder;
  const source = String(row.sourceType || (row.metadata as RawDocument | undefined)?.sourceTable || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();
  if (folder === "original") return source.includes("photo_galler") && !status.includes("retouch");
  if (folder === "retouched") return source.includes("photo_galler") && status.includes("retouch");
  if (folder === "client") return source.includes("client") || row.type === "memo";
  return source.includes("studio") || source.includes("workflow_artifact");
}

function formatDate(value?: string) {
  if (!value) return "날짜 없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 없음" : date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function MobileDocuments({
  initialSection,
  onOpenPreview,
}: {
  initialSection: MobileDocumentsSection;
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
}) {
  const [section, setSection] = useState<MobileDocumentsSection>(initialSection);
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [folder, setFolder] = useState<LibraryFolder>("all");
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<MobileResource[]>([]);
  const [documents, setDocuments] = useState<RawDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setSection(initialSection), [initialSection]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [quotesResponse, contractsResponse, documentsResponse, temporaryResponse] = await Promise.all([
        fetch("/api/quotes?limit=100", { cache: "no-store" }),
        fetch("/api/contracts?limit=100", { cache: "no-store" }),
        fetch("/api/documents/search?limit=50", { cache: "no-store" }),
        fetch("/api/documents/search?temporary=true&limit=50", { cache: "no-store" }),
      ]);
      const [quotesPayload, contractsPayload, documentsPayload, temporaryPayload] = await Promise.all([
        quotesResponse.json(), contractsResponse.json(), documentsResponse.json(), temporaryResponse.json(),
      ]);
      if (!quotesResponse.ok || !quotesPayload.ok) throw new Error(quotesPayload.error || "견적서를 불러오지 못했어요.");
      if (!contractsResponse.ok || !contractsPayload.ok) throw new Error(contractsPayload.error || "계약서를 불러오지 못했어요.");
      const temporaryBySource = new Map<string, RawDocument>();
      for (const row of temporaryPayload.documents || []) {
        const sourceId = String(documentMetadata(row).sourceId || "");
        if (sourceId) temporaryBySource.set(sourceId, row);
      }
      const normalized = [
        ...(quotesPayload.quotes || []).map((row: RawDocument) => normalizeQuoteResource(row)),
        ...(contractsPayload.contracts || []).map((row: RawDocument) => normalizeContractResource(row)),
      ].filter((item): item is MobileResource => Boolean(item)).map((item) => {
        const temporary = temporaryBySource.get(item.id);
        return temporary ? { ...item, temporaryDocumentId: String(documentMetadata(temporary).temporaryDocumentId || "") || undefined, status: String(temporary.status || item.status), statusLabel: normalizeMobileDocument(temporary)?.statusLabel || item.statusLabel } : item;
      }).sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
      setResources(normalized);
      const merged = [...(temporaryPayload.documents || []), ...(documentsPayload.documents || [])];
      const seen = new Set<string>();
      setDocuments(merged.filter((row: RawDocument) => {
        const key = String(documentMetadata(row).sourceId || row.sourceId || row.id || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "문서를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("olivia-resource-updated", refresh);
    return () => window.removeEventListener("olivia-resource-updated", refresh);
  }, [load]);

  const filteredResources = useMemo(() => resources.filter((resource) => filter === "all" || resource.type === filter), [filter, resources]);
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => documentMatchesFolder(document, folder) && (!normalizedQuery || `${document.title || ""} ${document.clientName || ""}`.toLowerCase().includes(normalizedQuery)));
  }, [documents, folder, query]);

  const openDocument = (row: RawDocument) => {
    const resource = normalizeMobileDocument(row);
    if (resource) onOpenPreview({ resourceType: resource.type, resourceId: resource.id, temporaryDocumentId: resource.temporaryDocumentId });
  };

  return (
    <section className={styles.screenWithHeader} aria-label="모바일 문서">
      <MobileHeader title="문서" subtitle="견적·계약과 저장된 문서를 확인하세요." />
      <div className={styles.scrollBody}>
        <div className={styles.segmented}>
          <button type="button" className={section === "quote-contract" ? styles.segmentedActive : undefined} onClick={() => setSection("quote-contract")}>견적/계약</button>
          <button type="button" className={section === "library" ? styles.segmentedActive : undefined} onClick={() => setSection("library")}>문서함</button>
        </div>

        {section === "quote-contract" ? <>
          <div className={styles.filterChips}>{(["all", "quote", "contract"] as const).map((id) => <button type="button" key={id} className={filter === id ? styles.filterActive : undefined} onClick={() => setFilter(id)}>{id === "all" ? "전체" : id === "quote" ? "견적서" : "계약서"}</button>)}</div>
          <div className={styles.listHeading}><h3>견적/계약</h3><span>{filteredResources.length}</span></div>
          {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>문서를 확인하고 있어요...</div> : filteredResources.length ? <div className={styles.resourceList}>{filteredResources.map((resource) => <button type="button" key={`${resource.type}:${resource.id}`} onClick={() => onOpenPreview({ resourceType: resource.type, resourceId: resource.id, temporaryDocumentId: resource.temporaryDocumentId })}>
            <span className={styles.resourceIcon}>{resource.type === "quote" ? <FileText size={19} /> : <FileSignature size={19} />}</span>
            <span className={styles.resourceCopy}><strong>{resource.title}</strong><small>{resource.clientName || "고객 미연결"} · {formatDate(resource.updatedAt)}</small><span>{resource.statusLabel}{resource.totalAmount ? <b>{formatMobileWon(resource.totalAmount)}</b> : null}</span></span>
            <ChevronRight size={19} />
          </button>)}</div> : <div className={styles.emptyState}><FileText size={22} /><span>저장된 문서가 없어요.</span></div>}
        </> : <>
          <label className={`${styles.searchField} ${styles.documentSearch}`}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="문서함 검색" /></label>
          <div className={styles.folderGrid}>
            {FOLDERS.map(({ id, label, Icon }) => <button type="button" key={id} className={folder === id ? styles.folderActive : undefined} onClick={() => setFolder(folder === id ? "all" : id)}><span><Icon size={20} /></span><strong>{label}</strong><small>{documents.filter((row) => documentMatchesFolder(row, id)).length}개</small></button>)}
          </div>
          <div className={styles.listHeading}><h3>{folder === "all" ? "최근 파일" : FOLDERS.find((item) => item.id === folder)?.label}</h3><span>{filteredDocuments.length}</span></div>
          {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>문서함을 확인하고 있어요...</div> : filteredDocuments.length ? <div className={styles.fileList}>{filteredDocuments.map((document) => <button type="button" key={String(document.id)} onClick={() => openDocument(document)}><span><FileText size={17} /></span><span><strong>{String(document.title || "문서")}</strong><small>{formatDate(String(document.updatedAt || ""))}{document.clientName ? ` · ${String(document.clientName)}` : ""}</small></span><ChevronRight size={18} /></button>)}</div> : <div className={styles.emptyState}><FileArchive size={22} /><span>저장된 문서가 없어요.</span></div>}
        </>}
      </div>
    </section>
  );
}
