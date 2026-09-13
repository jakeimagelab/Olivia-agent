"use client";

import {
  ChevronLeft,
  ChevronRight,
  File,
  FileImage,
  Folder,
  FolderOpen,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  Search,
  Server,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  buildRemoteNasBreadcrumbs,
  normalizeRemoteNasRelativePath,
  parentRemoteNasPath,
  toRemoteNasDisplayPath,
} from "@/lib/remote-nas/path";
import { mockRemoteNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type {
  RemoteNasDataSource,
  RemoteNasEntry,
  RemoteNasFolderResult,
  RemoteNasSelection,
} from "@/lib/remote-nas/types";
import styles from "./RemoteNasBrowser.module.css";

export type RemoteNasBrowserProps = {
  dataSource?: RemoteNasDataSource;
  initialPath?: string;
  onSelect?: (path: string, selection: RemoteNasSelection) => void;
  onCancel?: () => void;
};

const REMOTE_NAS_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 ** 2) return `${Math.round(sizeBytes / 1024)} KB`;
  if (sizeBytes < 1024 ** 3) return `${(sizeBytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatModifiedAt(modifiedAt: string | null): string {
  if (!modifiedAt) return "—";
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime())) return "—";
  return REMOTE_NAS_DATE_FORMATTER.format(date);
}

function getEntryType(entry: RemoteNasEntry): string {
  if (entry.kind === "directory") return "폴더";
  const extension = entry.displayName.split(".").pop()?.toUpperCase();
  if (extension === "JPG" || extension === "JPEG") return "JPEG 이미지";
  if (extension === "CR2") return "Canon RAW";
  if (extension === "JSON") return "JSON 문서";
  if (extension === "TXT") return "텍스트 문서";
  return extension ? `${extension} 파일` : "파일";
}

function EntryIcon({ entry }: { entry: RemoteNasEntry }) {
  if (entry.kind === "directory") return <Folder size={20} strokeWidth={1.65} aria-hidden="true" />;
  if (entry.mimeType?.startsWith("image/")) return <FileImage size={20} strokeWidth={1.65} aria-hidden="true" />;
  return <File size={20} strokeWidth={1.65} aria-hidden="true" />;
}

export default function RemoteNasBrowser({
  dataSource = mockRemoteNasDataSource,
  initialPath = "",
  onSelect,
  onCancel,
}: RemoteNasBrowserProps) {
  const [currentPath, setCurrentPath] = useState(() => normalizeRemoteNasRelativePath(initialPath));
  const [result, setResult] = useState<RemoteNasFolderResult | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError("");
    dataSource.listFolder(currentPath, { signal: controller.signal })
      .then((nextResult) => {
        if (!active) return;
        setResult(nextResult);
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "NAS 폴더를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentPath, dataSource, reloadKey]);

  const breadcrumbs = useMemo(() => buildRemoteNasBreadcrumbs(currentPath), [currentPath]);
  const visibleEntries = useMemo(() => {
    const entries = result?.path === currentPath ? result.entries : [];
    const normalizedQuery = deferredQuery.trim().normalize("NFC").toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return entries;
    return entries.filter((entry) => entry.displayName.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
  }, [currentPath, deferredQuery, result]);

  const navigateTo = (path: string) => {
    setQuery("");
    setCurrentPath(normalizeRemoteNasRelativePath(path));
  };

  const handleBack = () => {
    if (currentPath) {
      navigateTo(parentRemoteNasPath(currentPath));
      return;
    }
    onCancel?.();
  };

  const handleSelect = () => {
    if (!result || result.path !== currentPath || loading || error) return;
    const selection: RemoteNasSelection = {
      path: result.path,
      displayPath: result.displayPath,
      rootName: result.rootName,
    };
    onSelect?.(selection.path, selection);
  };

  const totalEntries = result?.path === currentPath ? result.entries.length : 0;
  const displayLocation = currentPath ? toRemoteNasDisplayPath(currentPath) : "NAS Root";
  const sourceIsMock = result?.connection.source === "mock";
  const macStudioState = result?.connection.macStudio ?? "unknown";
  const nasState = result?.connection.nas ?? "unknown";
  const macStudioLabel = macStudioState === "offline" ? "Offline" : macStudioState === "online" ? "Online" : "Checking";
  const nasLabel = nasState === "disconnected" ? "Disconnected" : nasState === "connected" ? "Connected" : "Checking";

  return (
    <section className={styles.browser} aria-label="원격 NAS 파일 브라우저">
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={handleBack} aria-label={currentPath ? "상위 폴더로 이동" : "원격 파일 브라우저 닫기"}>
          {currentPath ? <ChevronLeft size={21} aria-hidden="true" /> : <X size={19} aria-hidden="true" />}
        </button>

        <div className={styles.identity}>
          <span className={styles.identityIcon}><HardDrive size={22} strokeWidth={1.6} aria-hidden="true" /></span>
          <span>
            <small>OLIVIA REMOTE FILES</small>
            <strong>Workstation(M.2SSD)</strong>
          </span>
        </div>

        <div className={styles.connectionStates} aria-label="연결 상태">
          {sourceIsMock ? <span className={styles.previewBadge}>미리보기 데이터</span> : null}
          <span className={styles.statusBadge} aria-label={`Mac Studio ${macStudioLabel}`}>
            <i className={macStudioState === "unknown" ? styles.unknownDot : macStudioState === "offline" ? styles.offlineDot : styles.onlineDot} />
            <span className={styles.statusLong}>Mac Studio {macStudioLabel}</span>
            <span className={styles.statusShort} aria-hidden="true">MAC</span>
          </span>
          <span className={styles.statusBadge} aria-label={`NAS ${nasLabel}`}>
            <i className={nasState === "unknown" ? styles.unknownDot : nasState === "disconnected" ? styles.offlineDot : styles.onlineDot} />
            <span className={styles.statusLong}>NAS {nasLabel}</span>
            <span className={styles.statusShort} aria-hidden="true">NAS</span>
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.breadcrumbs} aria-label="현재 NAS 경로">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.path || "root"}>
              {index > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}
              <button
                type="button"
                onClick={() => navigateTo(crumb.path)}
                aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}
                title={crumb.label}
              >
                {crumb.root ? <HardDrive size={15} strokeWidth={1.6} aria-hidden="true" /> : null}
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>

        <label className={styles.searchBox}>
          <Search size={17} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.srOnly}>현재 폴더 검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="현재 폴더 검색" type="search" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={15} aria-hidden="true" /></button> : null}
        </label>
      </div>

      <div className={styles.locationBar}>
        <FolderOpen size={16} strokeWidth={1.7} aria-hidden="true" />
        <strong>{displayLocation}</strong>
        {loading ? <span className={styles.loadingLabel}>불러오는 중…</span> : null}
      </div>

      <div className={styles.listArea} aria-busy={loading}>
        {loading ? <div className={styles.loadingBar} aria-hidden="true"><i /></div> : null}

        <div className={styles.columnHeader} aria-hidden="true">
          <span>이름</span><span>종류</span><span>크기</span><span>수정일</span>
        </div>

        <div className={styles.entries} role="list">
          {error ? (
            <div className={styles.emptyState} role="alert">
              <span><Server size={25} strokeWidth={1.5} aria-hidden="true" /></span>
              <strong>폴더를 불러오지 못했습니다.</strong>
              <p>{error}</p>
              <button type="button" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button>
            </div>
          ) : null}

          {!error && !loading && visibleEntries.length === 0 ? (
            <div className={styles.emptyState}>
              <span><FolderOpen size={25} strokeWidth={1.5} aria-hidden="true" /></span>
              <strong>{query ? "검색 결과가 없습니다." : "비어 있는 폴더입니다."}</strong>
              <p>{query ? "파일명이나 폴더명을 다시 확인해주세요." : "이 폴더에는 표시할 항목이 없습니다."}</p>
            </div>
          ) : null}

          {!error ? visibleEntries.map((entry) => {
            const content = (
              <>
                <span className={styles.entryName}>
                  <i className={entry.kind === "directory" ? styles.folderIcon : styles.fileIcon}><EntryIcon entry={entry} /></i>
                  <span><strong>{entry.displayName}</strong><small>{getEntryType(entry)} · {formatFileSize(entry.sizeBytes)} · {formatModifiedAt(entry.modifiedAt)}</small></span>
                  {entry.kind === "directory" ? <ChevronRight className={styles.entryChevron} size={16} aria-hidden="true" /> : null}
                </span>
                <span className={styles.entryMeta}>{getEntryType(entry)}</span>
                <span className={styles.entryMeta}>{formatFileSize(entry.sizeBytes)}</span>
                <span className={styles.entryMeta}>{formatModifiedAt(entry.modifiedAt)}</span>
              </>
            );

            return entry.kind === "directory" ? (
              <button
                key={entry.path}
                type="button"
                className={styles.entryRow}
                onClick={() => navigateTo(entry.path)}
                title={`${entry.displayName} 폴더 열기`}
                role="listitem"
              >
                {content}
              </button>
            ) : (
              <div key={entry.path} className={`${styles.entryRow} ${styles.fileRow}`} title={entry.displayPath} role="listitem">
                {content}
              </div>
            );
          }) : null}
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerMeta}>
          <strong>{query ? `${visibleEntries.length} / ${totalEntries}` : totalEntries}개 항목</strong>
          <span><LockKeyhole size={13} strokeWidth={1.8} aria-hidden="true" /> 읽기 전용</span>
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>취소</button>
          <button type="button" className={styles.selectButton} onClick={handleSelect} disabled={!result || result.path !== currentPath || loading || Boolean(error)}>
            <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" /> 이 폴더 선택
          </button>
        </div>
      </footer>
    </section>
  );
}
