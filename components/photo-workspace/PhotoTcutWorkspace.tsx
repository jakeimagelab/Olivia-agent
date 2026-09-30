"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, EyeOff, FolderOpen, Loader2, MoveRight, ScanSearch, Sparkles, Undo2 } from "lucide-react";
import { METADATA_SELECT_JPG_EXTENSIONS } from "@/lib/metadataSelect/matcher";
import { transferFilesSafely, type MetadataFileTransfer } from "@/lib/metadataSelect/fileOperations";
import {
  isTcutCandidate,
  tcutReasonLabel,
  tcutReasons,
  type TcutChecks,
  type TcutReason,
  type TcutVisualAssessment,
} from "@/lib/photoTcut/analysis";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./PhotoTcutWorkspace.module.css";

type TcutTab = "ai" | "manual";
type Phase = "idle" | "scanning" | "ready" | "moving" | "done" | "failed";

type TcutPhoto = {
  name: string;
  handle: FileSystemFileHandle;
  thumbnail: string;
  blurScore: number;
  assessment: TcutVisualAssessment | null;
  reasons: TcutReason[];
  selected: boolean;
};

type VisionResult = TcutVisualAssessment & { name: string };

const ALL_CHECKS: TcutChecks = { eyesClosed: true, blur: true, faceUnreadableLighting: true };

function isPhoto(name: string): boolean {
  return METADATA_SELECT_JPG_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() ?? "");
}

async function makePreview(file: File): Promise<{ thumbnail: string; blurScore: number }> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
      element.src = source;
    });
    const max = 320;
    const scale = Math.min(max / image.width, max / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("이미지 분석 캔버스를 만들지 못했습니다.");
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const gray = new Float32Array(width * height);
    for (let index = 0; index < gray.length; index += 1) {
      gray[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
    }
    let total = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const at = y * width + x;
        const laplacian = gray[at] * 4 - gray[(y - 1) * width + x] - gray[(y + 1) * width + x] - gray[y * width + x - 1] - gray[y * width + x + 1];
        total += laplacian * laplacian;
        count += 1;
      }
    }
    return { thumbnail: canvas.toDataURL("image/jpeg", 0.72), blurScore: count ? Math.sqrt(total / count) : 0 };
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function readPhotos(root: FileSystemDirectoryHandle): Promise<TcutPhoto[]> {
  const entries: Array<[string, FileSystemFileHandle]> = [];
  for await (const [name, handle] of (root as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === "file" && isPhoto(name)) entries.push([name, handle as FileSystemFileHandle]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right, "ko-KR", { numeric: true, sensitivity: "base" }));
  const photos: TcutPhoto[] = [];
  for (const [name, handle] of entries) {
    const preview = await makePreview(await handle.getFile());
    photos.push({ name, handle, ...preview, assessment: null, reasons: [], selected: false });
  }
  return photos;
}

async function analyzeVision(photos: readonly TcutPhoto[], checks: TcutChecks): Promise<Map<string, TcutVisualAssessment>> {
  const results = new Map<string, TcutVisualAssessment>();
  if (!checks.eyesClosed && !checks.faceUnreadableLighting) return results;
  for (let start = 0; start < photos.length; start += 8) {
    const batch = photos.slice(start, start + 8);
    const response = await fetch("/api/photo-tcut-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checks: { eyesClosed: checks.eyesClosed, faceUnreadableLighting: checks.faceUnreadableLighting },
        images: batch.map((photo) => ({ name: photo.name, thumbnail: photo.thumbnail })),
      }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; error?: string; results?: VisionResult[] } | null;
    if (!response.ok || !body?.ok || !Array.isArray(body.results)) throw new Error(body?.error || "눈·조명 분석에 실패했습니다.");
    for (const result of body.results) {
      if (typeof result?.name !== "string") continue;
      results.set(result.name, {
        eyesClosed: Boolean(result.eyesClosed),
        faceUnreadableLighting: Boolean(result.faceUnreadableLighting),
        lightingReason: typeof result.lightingReason === "string" ? result.lightingReason : null,
      });
    }
  }
  return results;
}

async function ensureWritePermission(directory: FileSystemDirectoryHandle): Promise<void> {
  const handle = directory as any;
  if (typeof handle.queryPermission !== "function") return;
  let permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && typeof handle.requestPermission === "function") {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }
  if (permission !== "granted") throw new Error(`${directory.name} 폴더의 읽기·쓰기 권한이 필요합니다.`);
}

function checkLabel(check: keyof TcutChecks): string {
  if (check === "eyesClosed") return "눈 감음";
  if (check === "blur") return "흔들림";
  return "조명 미발광 / 얼굴 식별 불가";
}

export default function PhotoTcutWorkspace({ rootDir }: { rootDir: FileSystemDirectoryHandle | null }) {
  const { setCurrentLocalFolder } = usePhotoStudioExecution();
  const [tab, setTab] = useState<TcutTab>("ai");
  const [checks, setChecks] = useState<TcutChecks>(ALL_CHECKS);
  const [photos, setPhotos] = useState<TcutPhoto[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });

  useEffect(() => {
    setPhotos([]);
    setPhase("idle");
    setMessage("");
  }, [rootDir, tab]);

  const chooseFolder = async () => {
    try {
      const picker = (window as typeof window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) throw new Error("Chrome 또는 Edge에서 작업 폴더를 선택할 수 있습니다.");
      setCurrentLocalFolder(await picker({ mode: "readwrite" }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "폴더를 선택하지 못했습니다.");
      setPhase("failed");
    }
  };

  const scan = async () => {
    if (!rootDir || phase === "scanning" || phase === "moving") return;
    setPhase("scanning");
    setMessage("");
    try {
      const source = await readPhotos(rootDir);
      if (tab === "manual") {
        setPhotos(source);
        setPhase("ready");
        return;
      }
      const vision = await analyzeVision(source, checks);
      const analyzed = source.map((photo) => {
        const assessment = vision.get(photo.name) ?? null;
        const reasons = tcutReasons({ blurScore: photo.blurScore }, assessment, checks);
        return { ...photo, assessment, reasons, selected: isTcutCandidate(reasons) };
      });
      setPhotos(analyzed);
      setPhase("ready");
      setMessage(`T컷 후보 ${analyzed.filter((photo) => isTcutCandidate(photo.reasons)).length.toLocaleString("ko-KR")}장을 확인했습니다. 이동 전 사진을 직접 검토하세요.`);
    } catch (error) {
      setPhotos([]);
      setMessage(error instanceof Error ? error.message : "T컷 분석에 실패했습니다.");
      setPhase("failed");
    }
  };

  const candidates = useMemo(() => tab === "ai" ? photos.filter((photo) => isTcutCandidate(photo.reasons)) : photos, [photos, tab]);
  const selectedCount = candidates.filter((photo) => photo.selected).length;

  const toggle = (name: string) => setPhotos((current) => current.map((photo) => photo.name === name ? { ...photo, selected: !photo.selected } : photo));
  const setAll = (selected: boolean) => {
    const names = new Set(candidates.map((photo) => photo.name));
    setPhotos((current) => current.map((photo) => names.has(photo.name) ? { ...photo, selected } : photo));
  };

  const moveToTrash = async () => {
    if (!rootDir || !selectedCount || phase === "moving") return;
    const selected = candidates.filter((photo) => photo.selected);
    const confirmed = window.confirm(`${selected.length.toLocaleString("ko-KR")}장 JPG를 Trash_JPG로 이동합니다.\n\n파일은 삭제하지 않고 복사 → size·SHA-256 검증 → 검증 성공 후 원본 정리 방식으로 이동합니다.\n\n계속하시겠습니까?`);
    if (!confirmed) return;
    setPhase("moving");
    setMessage("");
    setProgress({ current: 0, total: selected.length, name: "" });
    try {
      await ensureWritePermission(rootDir);
      const trash = await (rootDir as any).getDirectoryHandle("Trash_JPG", { create: true }) as FileSystemDirectoryHandle;
      const transfers: MetadataFileTransfer[] = selected.map((photo) => ({
        name: photo.name,
        sourceDirectory: rootDir,
        sourceHandle: photo.handle,
      }));
      await transferFilesSafely({
        transfers,
        destination: trash,
        deleteSources: true,
        onProgress: (current, total, name) => setProgress({ current, total, name }),
      });
      const moved = new Set(selected.map((photo) => photo.name));
      setPhotos((current) => current.filter((photo) => !moved.has(photo.name)));
      setPhase("done");
      setMessage(`${selected.length.toLocaleString("ko-KR")}장 Trash_JPG 이동 완료 · 원본 바이트 검증 성공`);
    } catch (error) {
      setPhase("failed");
      setMessage(`${error instanceof Error ? error.message : "Trash_JPG 이동에 실패했습니다."}\n원본 JPG는 변경되지 않았습니다.`);
    }
  };

  if (!rootDir) {
    return <section className={styles.empty}><FolderOpen size={28} /><strong>현재 작업 폴더가 없습니다.</strong><p>사진 작업실에서 선택한 폴더를 그대로 사용하거나, 여기서 T컷 작업을 시작하세요.</p><button type="button" onClick={chooseFolder}>폴더 선택</button></section>;
  }

  return (
    <section className={styles.surface} aria-label="T컷 정리">
      <header className={styles.header}>
        <span className={styles.headerIcon}><EyeOff size={21} /></span>
        <div><h2>T컷 정리</h2><p>촬영 실패컷을 확인한 뒤 Trash_JPG로 정리합니다.</p></div>
        <span className={styles.folder}><FolderOpen size={14} />현재 작업 폴더: <strong>{rootDir.name}</strong></span>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="T컷 정리 방식">
        <button type="button" role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")}><Sparkles size={15} />AI T컷 정리</button>
        <button type="button" role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")}><ScanSearch size={15} />직접 T컷 정리</button>
      </nav>

      <div className={styles.body}>
        <section className={styles.controls}>
          <div className={styles.folderRow}><span><FolderOpen size={16} />{rootDir.name}</span><button type="button" onClick={chooseFolder} disabled={phase === "scanning" || phase === "moving"}>폴더 변경</button></div>
          {tab === "ai" ? (
            <fieldset className={styles.checks}>
              <legend>검사 항목</legend>
              {(Object.keys(checks) as Array<keyof TcutChecks>).map((check) => <label key={check}><input type="checkbox" checked={checks[check]} onChange={(event) => setChecks((current) => ({ ...current, [check]: event.target.checked }))} disabled={phase === "scanning" || phase === "moving"} />{checkLabel(check)}</label>)}
            </fieldset>
          ) : <p className={styles.manualNote}>현재 폴더의 JPG를 직접 확인해 T컷 목록에 넣습니다. 사진은 이동 전까지 바뀌지 않습니다.</p>}
          <button type="button" className={styles.scanButton} onClick={() => void scan()} disabled={phase === "scanning" || phase === "moving"}>{phase === "scanning" ? <><Loader2 size={16} className="spin-icon" />분석 중…</> : tab === "ai" ? <><Sparkles size={16} />T컷 분석 시작</> : <><ScanSearch size={16} />사진 불러오기</>}</button>
          {message ? <div className={`${styles.message} ${phase === "failed" ? styles.error : phase === "done" ? styles.done : ""}`}>{phase === "failed" ? <Undo2 size={15} /> : phase === "done" ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}<span>{message}</span></div> : null}
        </section>

        <section className={styles.results}>
          <div className={styles.resultHeading}><div><h3>{tab === "ai" ? "T컷 후보" : "폴더 사진"}</h3><p>{phase === "ready" || phase === "done" ? `${candidates.length.toLocaleString("ko-KR")}장 · 선택 ${selectedCount.toLocaleString("ko-KR")}장` : "분석을 시작하면 후보를 표시합니다."}</p></div>{candidates.length ? <div><button type="button" onClick={() => setAll(true)}>전체 선택</button><button type="button" onClick={() => setAll(false)}>전체 해제</button></div> : null}</div>
          {phase === "moving" ? <div className={styles.progress}><Loader2 size={16} className="spin-icon" /><span>Trash_JPG 이동 및 무결성 검사 {progress.current} / {progress.total}</span><small>{progress.name}</small></div> : null}
          {candidates.length ? <div className={styles.grid}>{candidates.map((photo) => <button type="button" key={photo.name} className={`${styles.card} ${photo.selected ? styles.cardSelected : ""}`} onClick={() => toggle(photo.name)} aria-pressed={photo.selected}><span className={styles.thumbnail}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.thumbnail} alt="" /></span><span className={styles.cardBody}><span className={styles.cardTitle}>{photo.name}</span><span className={styles.reasons}>{photo.reasons.length ? photo.reasons.map((reason) => <i key={reason}>{tcutReasonLabel(reason)}</i>) : <i>직접 선택</i>}</span></span><span className={styles.check}>{photo.selected ? <Check size={14} strokeWidth={3} /> : null}</span></button>)}</div> : <div className={styles.emptyResults}>검사 대상 사진이 없습니다.</div>}
        </section>
      </div>
      <footer className={styles.footer}><span>{selectedCount ? `선택한 ${selectedCount.toLocaleString("ko-KR")}장은 삭제하지 않고 Trash_JPG로 이동합니다.` : "이동할 사진을 선택하세요."}</span><button type="button" onClick={() => void moveToTrash()} disabled={!selectedCount || phase === "moving"}><MoveRight size={16} />선택 {selectedCount.toLocaleString("ko-KR")}장 Trash_JPG로 이동</button></footer>
    </section>
  );
}
