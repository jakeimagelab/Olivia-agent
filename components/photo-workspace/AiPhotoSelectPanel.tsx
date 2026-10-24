"use client";

import { Check, FolderOpen, Image as ImageIcon, Loader2, MessageCircle, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectJpgFolderGroups, type SelectMatchPhoto } from "@/lib/selectMatch/folderScanner";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import styles from "./PhotoWorkspace.module.css";

type Candidate = {
  id: string;
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  thumbnail: string;
  thumbnailBlob: Blob;
  score: number;
  reason: string;
};

type ApiCandidate = { name: string; score: number; reason: string };

export type AiPhotoSelectCallbacks = {
  initialFolder?: FileSystemDirectoryHandle | null;
  selectedJpgNames?: readonly string[];
  lockFolder?: boolean;
  onSelectFolder?: (folder: FileSystemDirectoryHandle) => void;
  onConfirmSelection?: (candidateNames: string[]) => void;
  onStartRawMatch?: (candidateNames: string[]) => void;
};

function photoId(parent: FileSystemDirectoryHandle, photo: SelectMatchPhoto): string {
  return `${parent.name.normalize("NFC")}\u0000${photo.name.normalize("NFC")}`;
}

/** A small visual derivative is sent only for analysis; the source file is never written or altered. */
const CANDIDATE_PAGE_SIZE = 200;
const PROGRESS_BATCH_SIZE = 20;
const PROGRESS_INTERVAL_MS = 120;

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진 미리보기를 만들지 못했습니다.")), "image/jpeg", quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("사진 미리보기를 읽지 못했습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("사진 미리보기를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

function releaseObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

async function makeThumbnail(file: File): Promise<{ url: string; blob: Blob }> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name} 미리보기를 만들지 못했습니다.`));
      element.src = source;
    });
    const scale = Math.min(360 / image.width, 360 / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진 미리보기를 만들지 못했습니다.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToJpegBlob(canvas, 0.72);
    return { url: URL.createObjectURL(blob), blob };
  } finally {
    releaseObjectUrl(source);
  }
}

export default function AiPhotoSelectPanel(callbacks: AiPhotoSelectCallbacks) {
  const { pick: pickPhotoFolder, error: folderPickerError } = usePhotoFolderPicker();
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(callbacks.initialFolder ?? null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceCount, setSourceCount] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(CANDIDATE_PAGE_SIZE);
  const thumbnailUrlsRef = useRef(new Set<string>());

  const releaseThumbnailUrls = useCallback(() => {
    for (const url of thumbnailUrlsRef.current) releaseObjectUrl(url);
    thumbnailUrlsRef.current.clear();
  }, []);

  const clearCandidates = useCallback(() => {
    releaseThumbnailUrls();
    setCandidates([]);
    setVisibleCandidateCount(CANDIDATE_PAGE_SIZE);
  }, [releaseThumbnailUrls]);

  useEffect(() => () => releaseThumbnailUrls(), [releaseThumbnailUrls]);

  const selectedCandidates = useMemo(() => candidates.filter((candidate) => selected.has(candidate.id)), [candidates, selected]);

  useEffect(() => {
    if (!callbacks.initialFolder || callbacks.initialFolder === folder) return;
    setFolder(callbacks.initialFolder);
    clearCandidates();
    setSelected(new Set());
    setSourceCount(0);
    setStatus("");
  }, [callbacks.initialFolder, clearCandidates, folder]);

  useEffect(() => {
    if (!candidates.length || !callbacks.selectedJpgNames) return;
    const selectedKeys = new Set(callbacks.selectedJpgNames.map(normalizePhotoToolFileKey));
    setSelected(new Set(candidates.filter((candidate) => selectedKeys.has(normalizePhotoToolFileKey(candidate.basename))).map((candidate) => candidate.id)));
  }, [callbacks.selectedJpgNames, candidates]);

  useEffect(() => {
    if (folderPickerError) setStatus(folderPickerError);
  }, [folderPickerError]);

  const selectFolder = async () => {
    const handle = await pickPhotoFolder("read");
    if (!handle) return;
    setFolder(handle);
    clearCandidates();
    setSelected(new Set());
    setSourceCount(0);
    setStatus("");
    callbacks.onSelectFolder?.(handle);
  };

  const search = async () => {
    if (!query.trim() || !folder || loading) return;
    setLoading(true);
    setStatus("사진 미리보기를 읽고 있습니다...");
    clearCandidates();
    setSelected(new Set());
    let prepared: Candidate[] = [];
    try {
      const groups = await collectJpgFolderGroups(folder);
      const source = groups.flatMap((group) => group.photos.map((photo) => ({ parent: group.dirHandle, photo })));
      if (!source.length) throw new Error("선택한 폴더에서 JPG 사진을 찾지 못했습니다.");
      setSourceCount(source.length);

      let lastStatusAt = 0;
      for (const [index, item] of source.entries()) {
        const current = index + 1;
        const now = Date.now();
        if (current === source.length || current % PROGRESS_BATCH_SIZE === 0 || now - lastStatusAt >= PROGRESS_INTERVAL_MS) {
          setStatus(`사진 미리보기 준비 ${current} / ${source.length}`);
          lastStatusAt = now;
        }
        const thumbnail = await makeThumbnail(await item.photo.handle.getFile());
        thumbnailUrlsRef.current.add(thumbnail.url);
        prepared.push({
          id: photoId(item.parent, item.photo),
          name: item.photo.name,
          basename: item.photo.basename,
          handle: item.photo.handle,
          thumbnail: thumbnail.url,
          thumbnailBlob: thumbnail.blob,
          score: 0,
          reason: "",
        });
        if (current % PROGRESS_BATCH_SIZE === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }

      const matches: ApiCandidate[] = [];
      lastStatusAt = 0;
      for (let start = 0; start < prepared.length; start += 8) {
        const batch = prepared.slice(start, start + 8);
        const current = Math.min(start + batch.length, prepared.length);
        const now = Date.now();
        if (current === prepared.length || current % PROGRESS_BATCH_SIZE === 0 || now - lastStatusAt >= PROGRESS_INTERVAL_MS) {
          setStatus(`AI가 관련 장면을 찾는 중 ${current} / ${prepared.length}`);
          lastStatusAt = now;
        }
        const images = await Promise.all(batch.map(async ({ name, thumbnailBlob }) => ({ name, thumbnail: await blobToDataUrl(thumbnailBlob) })));
        const response = await fetch("/api/photo-select-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), images }),
        });
        const body = await response.json().catch(() => null) as { ok?: boolean; error?: string; candidates?: ApiCandidate[] } | null;
        if (!response.ok || !body?.ok || !Array.isArray(body.candidates)) throw new Error(body?.error || "AI 사진 셀렉에 실패했습니다.");
        matches.push(...body.candidates);
      }

      const resultsByName = new Map(matches.map((item) => [item.name.normalize("NFC").toLocaleLowerCase("en-US"), item]));
      const next = prepared
        .map((candidate) => {
          const result = resultsByName.get(candidate.name.normalize("NFC").toLocaleLowerCase("en-US"));
          return result ? { ...candidate, score: result.score, reason: result.reason } : candidate;
        })
        .filter((candidate) => candidate.score >= 1)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ko-KR", { numeric: true }));
      const keptUrls = new Set(next.map((candidate) => candidate.thumbnail));
      for (const candidate of prepared) {
        if (keptUrls.has(candidate.thumbnail)) continue;
        releaseObjectUrl(candidate.thumbnail);
        thumbnailUrlsRef.current.delete(candidate.thumbnail);
      }
      setCandidates(next);
      prepared = [];
      setStatus(next.length ? `관련 후보 ${next.length}장을 찾았습니다. 사진을 확인하고 최종 선택하세요.` : "요청과 직접 관련된 후보를 찾지 못했습니다. 직접 셀렉을 사용하거나 설명을 바꿔보세요.");
    } catch (error) {
      for (const candidate of prepared) {
        releaseObjectUrl(candidate.thumbnail);
        thumbnailUrlsRef.current.delete(candidate.thumbnail);
      }
      setStatus(error instanceof Error ? error.message : "AI 사진 셀렉에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCandidate = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedNames = selectedCandidates.map((candidate) => candidate.basename.toLocaleLowerCase("en-US"));

  return (
    <section className={styles.aiSurface} aria-label="AI 사진 셀렉">
      <header className={styles.aiHeader}>
        <span className={styles.aiHeaderIcon}><ImageIcon size={21} aria-hidden="true" /></span>
        <div><h2>AI 사진 셀렉</h2><p>원하는 장면을 설명하면 JPG 후보를 찾아 최종 선택을 돕습니다.</p></div>
        <span className={styles.aiFolderChip}><FolderOpen size={14} aria-hidden="true" />현재 작업 폴더: <strong>{folder?.name ?? "선택 안 됨"}</strong></span>
      </header>
      <div className={styles.aiLayout}>
        <div className={styles.aiControls}>
          <div className={styles.aiIntro}>
            <p>원하는 사진을 자연어로 설명하면 AI가 JPG 후보를 찾습니다. 후보는 자동 확정하지 않으며, 마지막 선택은 직접 합니다.</p>
          </div>
          <section className={styles.aiSection}>
            <h3><span>1.</span> {callbacks.lockFolder ? "현재 Bridge 폴더" : "사진 폴더 선택"}</h3>
            <div className={styles.folderRow}>
              <span className={styles.folderState}><FolderOpen size={19} aria-hidden="true" />{folder?.name || "폴더가 선택되지 않았습니다."}</span>
              {!callbacks.lockFolder ? <button type="button" className={styles.secondaryButton} onClick={() => void selectFolder()} disabled={loading}>폴더 선택</button> : null}
            </div>
          </section>
          <section className={styles.aiSection}>
            <h3><span>2.</span> 원하는 사진 설명</h3>
            <div className={styles.searchRow}>
              <label className={styles.searchInput}>
                <MessageCircle size={17} aria-hidden="true" />
                <span className="sr-only">원하는 사진 설명</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="예) 상반신 사진 골라줘, 상담하는 장면 찾아줘" />
              </label>
              <button type="button" className={styles.primaryButton} disabled={!query.trim() || !folder || loading} onClick={() => void search()}>{loading ? <Loader2 size={16} className="spin-icon" /> : <Search size={16} />}찾기</button>
            </div>
            {!loading && !folder ? <p className={styles.searchHint}>폴더를 먼저 선택하세요.</p> : null}
            {!loading && folder && !query.trim() ? <p className={styles.searchHint}>찾을 사진을 설명해 주세요.</p> : null}
            {status ? <p className={styles.inlineNotice} role="status">{status}</p> : null}
          </section>
        </div>
        <aside className={styles.aiPreview}>
          <section className={styles.aiSection}>
            <div className={styles.sectionHeading}><h3><span>3.</span> 후보 사진</h3><small>{sourceCount}장 중 관련 후보 {candidates.length}장 · {selected.size}장 선택됨</small></div>
            {candidates.length ? (
              <div className={styles.aiCandidateGrid}>
                {candidates.slice(0, visibleCandidateCount).map((candidate) => (
                  <button key={candidate.id} type="button" className={`${styles.aiCandidate} ${selected.has(candidate.id) ? styles.aiCandidateSelected : ""}`} onClick={() => toggleCandidate(candidate.id)} aria-pressed={selected.has(candidate.id)}>
                    {/* The thumbnail is a read-only visual preview; no source image data is changed. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={candidate.thumbnail} alt="" />
                    <span><strong>{candidate.name}</strong><small>{candidate.reason}</small></span>
                    <i>{selected.has(candidate.id) ? <Check size={14} strokeWidth={3} /> : `관련도 ${candidate.score}`}</i>
                  </button>
                ))}
                {visibleCandidateCount < candidates.length ? (
                  <button type="button" className={styles.aiMoreButton} onClick={() => setVisibleCandidateCount((current) => Math.min(current + CANDIDATE_PAGE_SIZE, candidates.length))}>
                    더 보기 · {(candidates.length - visibleCandidateCount).toLocaleString("ko-KR")}장 남음
                  </button>
                ) : null}
              </div>
            ) : <div className={styles.emptyState}><ImageIcon size={46} strokeWidth={1.35} aria-hidden="true" /><p>{loading ? "AI가 사진을 분석하고 있습니다." : "사진 폴더를 선택하고 검색을 시작하세요."}</p></div>}
          </section>
        </aside>
      </div>
      <footer className={styles.aiActions}>
        <button type="button" className={styles.mutedButton} disabled={!selected.size || loading} onClick={() => setSelected(new Set())}>선택 초기화</button>
        <div><button type="button" className={styles.secondaryButton} disabled={!selected.size || loading} onClick={() => callbacks.onConfirmSelection?.(selectedNames)}>선택만 저장 ({selected.size}장)</button><button type="button" className={styles.primaryButton} disabled={!selected.size || loading} onClick={() => callbacks.onStartRawMatch?.(selectedNames)}>저장하고 RAW 매칭으로</button></div>
      </footer>
    </section>
  );
}
