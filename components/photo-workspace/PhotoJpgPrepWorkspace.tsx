"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FolderInput, FolderOpen, Loader2, Square, TriangleAlert } from "lucide-react";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { moveFileFast } from "@/lib/photo-classifier/file-move";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { CAMERA_JPG_EXTENSIONS, isHiddenSystemFile, RAW_PHOTO_EXTENSIONS } from "@/lib/photo/extensions";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./WorkspaceSurface.module.css";

type Phase = "idle" | "scanning" | "ready" | "running" | "stopped" | "done" | "failed";
type PlanStatus = "move" | "moved" | "skip" | "conflict";

type SourceJpg = {
  fileHandle: FileSystemFileHandle;
  sourceDirectory: FileSystemDirectoryHandle;
  name: string;
  size: number;
  lastModified: number;
  relativeDirectory: string[];
};

type PlanRow = SourceJpg & {
  destinationDirectory: string[];
  destinationPath: string;
  status: PlanStatus;
  reason: string;
};

type PrepPlan = {
  rows: PlanRow[];
  rawUntouched: number;
  hiddenExcluded: number;
};

type Stats = { moved: number; skipped: number; rawUntouched: number; conflicts: number };
type RunProgress = {
  processed: number;
  total: number;
  currentName: string;
  moved: number;
  skipped: number;
  conflicts: number;
};

type DestinationEntry =
  | { kind: "file"; file: File }
  | { kind: "directory" };

type SourceJpgCandidate = Omit<SourceJpg, "size" | "lastModified">;

const EMPTY_STATS: Stats = { moved: 0, skipped: 0, rawUntouched: 0, conflicts: 0 };
const MAX_DEPTH = 5;
const RESULT_ROW_LIMIT = 40;
const FILE_METADATA_CONCURRENCY = 16;
const LOCAL_MOVE_CONCURRENCY = 3;

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const next = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function destinationKey(segments: readonly string[]): string {
  return segments.join("/").normalize("NFC").toLocaleLowerCase("en-US");
}

async function directoryIfPresent(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  for (const segment of segments) {
    try {
      current = await current.getDirectoryHandle(segment);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
  return current;
}

async function directoryForWrite(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true });
  return current;
}

async function existingDestination(
  root: FileSystemDirectoryHandle,
  directory: readonly string[],
  fileName: string,
): Promise<File | "directory" | null> {
  const parent = await directoryIfPresent(root, [JPG_INTEGRATED_DIRECTORY, ...directory]);
  if (!parent) return null;
  try {
    return await (await parent.getFileHandle(fileName)).getFile();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await parent.getDirectoryHandle(fileName);
    return "directory";
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function isJpgIntegratedRoot(name: string): boolean {
  return name.normalize("NFC") === JPG_INTEGRATED_DIRECTORY.normalize("NFC");
}

async function collectSources(root: FileSystemDirectoryHandle, includeSubdirectories: boolean): Promise<{ jpgs: SourceJpg[]; rawUntouched: number; hiddenExcluded: number }> {
  const candidates: SourceJpgCandidate[] = [];
  let rawUntouched = 0;
  let hiddenExcluded = 0;

  const visit = async (directory: FileSystemDirectoryHandle, relativeDirectory: string[], depth: number): Promise<void> => {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind === "directory") {
        if (isHiddenSystemFile(name)) continue;
        if (isJpgIntegratedRoot(name)) continue;
        if (includeSubdirectories && depth < MAX_DEPTH) {
          await visit(handle as FileSystemDirectoryHandle, [...relativeDirectory, name], depth + 1);
        }
        continue;
      }

      if (isHiddenSystemFile(name)) {
        hiddenExcluded += 1;
        continue;
      }
      const fileExtension = extension(name);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) {
        rawUntouched += 1;
        continue;
      }
      if (!CAMERA_JPG_EXTENSIONS.has(fileExtension)) continue;
      candidates.push({
        fileHandle: handle as FileSystemFileHandle,
        sourceDirectory: directory,
        name,
        relativeDirectory,
      });
    }
  };

  await visit(root, [], 0);
  const jpgs = await mapConcurrent(candidates, FILE_METADATA_CONCURRENCY, async (candidate) => {
    const file = await candidate.fileHandle.getFile();
    return { ...candidate, size: file.size, lastModified: file.lastModified };
  });
  return { jpgs, rawUntouched, hiddenExcluded };
}

async function collectDestinationIndex(root: FileSystemDirectoryHandle): Promise<Map<string, DestinationEntry>> {
  const index = new Map<string, DestinationEntry>();
  const integrated = await directoryIfPresent(root, [JPG_INTEGRATED_DIRECTORY]);
  if (!integrated) return index;

  const files: Array<{ key: string; handle: FileSystemFileHandle }> = [];
  const visit = async (directory: FileSystemDirectoryHandle, relativeDirectory: string[], depth: number): Promise<void> => {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      const relativePath = [...relativeDirectory, name];
      const key = destinationKey(relativePath);
      if (handle.kind === "directory") {
        index.set(key, { kind: "directory" });
        if (depth < MAX_DEPTH) await visit(handle as FileSystemDirectoryHandle, relativePath, depth + 1);
      } else {
        files.push({ key, handle: handle as FileSystemFileHandle });
      }
    }
  };

  await visit(integrated, [], 0);
  const metadata = await mapConcurrent(files, FILE_METADATA_CONCURRENCY, async ({ key, handle }) => ({
    key,
    file: await handle.getFile(),
  }));
  for (const entry of metadata) index.set(entry.key, { kind: "file", file: entry.file });
  return index;
}

function destinationParentConflict(index: ReadonlyMap<string, DestinationEntry>, segments: readonly string[]): boolean {
  for (let length = 1; length <= segments.length; length += 1) {
    if (index.get(destinationKey(segments.slice(0, length)))?.kind === "file") return true;
  }
  return false;
}

export async function buildJpgPrepPlan(
  root: FileSystemDirectoryHandle,
  options: { includeSubdirectories: boolean; preserveStructure: boolean },
): Promise<PrepPlan> {
  const [{ jpgs, rawUntouched, hiddenExcluded }, destinationIndex] = await Promise.all([
    collectSources(root, options.includeSubdirectories),
    collectDestinationIndex(root),
  ]);
  const plannedDestination = new Map<string, SourceJpg>();
  const rows: PlanRow[] = [];

  for (const jpg of jpgs) {
    const destinationDirectory = options.preserveStructure ? jpg.relativeDirectory : [];
    const destinationPath = [JPG_INTEGRATED_DIRECTORY, ...destinationDirectory, jpg.name].join("/");
    const destinationSegments = [...destinationDirectory, jpg.name];
    const key = destinationKey(destinationSegments);
    const duplicatePlan = plannedDestination.get(key);
    if (duplicatePlan) {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: `다른 원본과 목적지 이름이 같습니다: ${duplicatePlan.name}` });
      continue;
    }
    plannedDestination.set(key, jpg);

    if (destinationParentConflict(destinationIndex, destinationDirectory)) {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: "목적지 상위 경로에 같은 이름의 파일이 있습니다." });
      continue;
    }
    const existing = destinationIndex.get(key);
    if (existing?.kind === "directory") {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: "같은 이름의 폴더가 있습니다." });
    } else if (existing?.kind === "file") {
      const identical = existing.file.size === jpg.size && existing.file.lastModified === jpg.lastModified;
      rows.push({
        ...jpg,
        destinationDirectory,
        destinationPath,
        status: identical ? "skip" : "conflict",
        reason: identical ? "이미 같은 파일이 있습니다." : "같은 이름이지만 크기 또는 수정시각이 다릅니다.",
      });
    } else {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "move", reason: "JPG전체로 옮깁니다." });
    }
  }

  rows.sort((left, right) => left.destinationPath.localeCompare(right.destinationPath, "ko", { numeric: true, sensitivity: "base" }));
  return { rows, rawUntouched, hiddenExcluded };
}

function statsFor(plan: PrepPlan | null): Stats {
  if (!plan) return EMPTY_STATS;
  return {
    moved: plan.rows.filter((row) => row.status === "move" || row.status === "moved").length,
    skipped: plan.rows.filter((row) => row.status === "skip").length,
    rawUntouched: plan.rawUntouched,
    conflicts: plan.rows.filter((row) => row.status === "conflict").length,
  };
}

async function movePlannedJpg(root: FileSystemDirectoryHandle, row: PlanRow): Promise<void> {
  const lateDestination = await existingDestination(root, row.destinationDirectory, row.name);
  if (lateDestination) throw new Error(`${row.destinationPath}에 파일이 새로 생겨 덮어쓰지 않았습니다.`);
  const destinationDirectory = await directoryForWrite(root, [JPG_INTEGRATED_DIRECTORY, ...row.destinationDirectory]);
  const result = await moveFileFast({ src: row.fileHandle, destDir: destinationDirectory, fileName: row.name });
  if (result.method === "native-move") return;

  const copied = await (await destinationDirectory.getFileHandle(row.name)).getFile();
  if (copied.size !== row.size) {
    await destinationDirectory.removeEntry(row.name).catch(() => undefined);
    throw new Error(`${row.name} 복사 검증에 실패했습니다.`);
  }
  try {
    await row.sourceDirectory.removeEntry(row.name);
  } catch (error) {
    await destinationDirectory.removeEntry(row.name).catch(() => undefined);
    throw error;
  }
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "skip" | "danger" }) {
  return (
    <div className={`${styles.stat} ${tone === "skip" ? styles.statSkip : tone === "danger" ? styles.statDanger : ""}`}>
      <small>{label}</small><strong>{value.toLocaleString("ko-KR")}</strong>
    </div>
  );
}

export default function PhotoJpgPrepWorkspace({ onOpenPhotoSelect, bridgeEmbedded = false }: { onOpenPhotoSelect: () => void; bridgeEmbedded?: boolean }) {
  const { executionMode, currentLocalFolder, setCurrentLocalFolder } = usePhotoStudioExecution();
  const remote = executionMode === "REMOTE_WORKER";
  const { supported, pick, error: pickerError } = usePhotoFolderPicker();
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(currentLocalFolder);
  const [remoteSelection, setRemoteSelection] = useState<RemoteNasSelection | null>(null);
  const [remotePickerOpen, setRemotePickerOpen] = useState(false);
  const [includeSubdirectories, setIncludeSubdirectories] = useState(true);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState(bridgeEmbedded
    ? "현재 Bridge 폴더를 미리보기로 확인한 뒤 JPG정리를 실행하세요."
    : "폴더를 선택한 뒤 미리보기로 JPG와 RAW를 확인하세요.");
  const [plan, setPlan] = useState<PrepPlan | null>(null);
  const [destination, setDestination] = useState<FileSystemDirectoryHandle | null>(null);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    if (!root && currentLocalFolder) setRoot(currentLocalFolder);
  }, [currentLocalFolder, root]);

  const stats = useMemo(() => statsFor(plan), [plan]);
  const visibleRows = useMemo(() => {
    const rows = plan?.rows ?? [];
    return [...rows]
      .sort((left, right) => Number(right.status === "conflict") - Number(left.status === "conflict"))
      .slice(0, RESULT_ROW_LIMIT);
  }, [plan]);
  const hiddenRowCount = Math.max(0, (plan?.rows.length ?? 0) - visibleRows.length);
  const selectedName = remote ? remoteSelection?.displayPath : root?.name;
  const busy = phase === "scanning" || phase === "running";
  const showRunProgress = !remote && runProgress !== null && (phase === "running" || phase === "failed");
  const runPercent = runProgress && runProgress.total > 0
    ? Math.min(100, Math.round((runProgress.processed / runProgress.total) * 100))
    : 0;

  const chooseFolder = useCallback(async () => {
    if (remote) {
      setRemotePickerOpen(true);
      return;
    }
    const picked = await pick("readwrite");
    if (!picked) return;
    setRoot(picked);
    setCurrentLocalFolder(picked);
    setPlan(null);
    setDestination(null);
    setRunProgress(null);
    if (isJpgIntegratedRoot(picked.name)) {
      setPhase("failed");
      setMessage("이미 정리된 폴더입니다. 촬영 폴더를 선택하세요.");
    } else {
      setPhase("idle");
      setMessage("미리보기를 눌러 옮길 JPG와 그대로 둘 RAW를 확인하세요.");
    }
  }, [pick, remote, setCurrentLocalFolder]);

  const preview = useCallback(async () => {
    if (remote) {
      if (!remoteSelection) return;
      setPlan(null);
      setRunProgress(null);
      setPhase("ready");
      setMessage("Mac Studio는 실행할 때 JPG·RAW를 확인하고 기존 워커 경로로 안전하게 정리합니다.");
      return;
    }
    if (!root) return;
    if (isJpgIntegratedRoot(root.name)) {
      setPhase("failed");
      setMessage("이미 정리된 폴더입니다. 촬영 폴더를 선택하세요.");
      return;
    }
    setPhase("scanning");
    setMessage("폴더를 훑어 JPG·RAW와 충돌을 확인하는 중입니다.");
    try {
      const nextPlan = await buildJpgPrepPlan(root, { includeSubdirectories, preserveStructure });
      setPlan(nextPlan);
      setRunProgress(null);
      setPhase("ready");
      setMessage([
        `JPG ${nextPlan.rows.length.toLocaleString("ko-KR")}개를 확인했습니다. RAW ${nextPlan.rawUntouched.toLocaleString("ko-KR")}개는 그대로 둡니다.`,
        nextPlan.hiddenExcluded > 0 ? `맥 숨김파일 ${nextPlan.hiddenExcluded.toLocaleString("ko-KR")}개는 제외했습니다.` : null,
      ].filter(Boolean).join("\n"));
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "폴더를 확인하지 못했습니다.");
    }
  }, [includeSubdirectories, preserveStructure, remote, remoteSelection, root]);

  const run = useCallback(async () => {
    if (remote) {
      if (!remoteSelection) return;
      setRunProgress(null);
      setPhase("running");
      setMessage("Mac Studio에 JPG정리를 요청하는 중입니다.");
      try {
        const response = await fetch("/api/photo-operations/source-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderName: remoteSelection.path }),
        });
        const body: unknown = await response.json().catch(() => null);
        const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
        if (!response.ok || record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : "Mac Studio JPG정리를 시작하지 못했습니다.");
        setPhase("done");
        setMessage("PHOTO_PREPARE_SOURCE 작업을 시작했습니다. 진행 상태는 오른쪽 상단 작업표시줄에서 확인할 수 있습니다.");
      } catch (error) {
        setPhase("failed");
        setMessage(error instanceof Error ? error.message : "Mac Studio JPG정리를 시작하지 못했습니다.");
      }
      return;
    }

    if (!root || !plan) return;
    if (isJpgIntegratedRoot(root.name)) {
      setPhase("failed");
      setMessage("이미 정리된 폴더입니다. 촬영 폴더를 선택하세요.");
      return;
    }
    stopRequestedRef.current = false;
    setPhase("running");
    setMessage("JPG만 JPG전체로 옮기는 중입니다. RAW는 건드리지 않습니다.");
    const total = plan.rows.length;
    const progressSnapshot: RunProgress = { processed: 0, total, currentName: "", moved: 0, skipped: 0, conflicts: 0 };
    let lastPaintedAt = 0;
    setRunProgress(progressSnapshot);

    const paintProgress = (force = false) => {
      const now = Date.now();
      const finalUpdate = progressSnapshot.processed >= progressSnapshot.total;
      const batchUpdate = progressSnapshot.processed > 0 && progressSnapshot.processed % 20 === 0;
      if (!force && !finalUpdate && !batchUpdate && now - lastPaintedAt < 120) return;
      lastPaintedAt = now;
      setRunProgress({ ...progressSnapshot });
    };

    try {
      const completedRows = [...plan.rows];
      const pendingMoves: Array<{ index: number; row: PlanRow }> = [];
      for (const [index, row] of plan.rows.entries()) {
        if (row.status === "move") {
          pendingMoves.push({ index, row });
          continue;
        }
        if (row.status === "conflict") progressSnapshot.conflicts += 1;
        else progressSnapshot.skipped += 1;
        progressSnapshot.processed += 1;
      }

      let moveCursor = 0;
      const moveNext = async () => {
        while (!stopRequestedRef.current && moveCursor < pendingMoves.length) {
          const entry = pendingMoves[moveCursor];
          moveCursor += 1;
          progressSnapshot.currentName = entry.row.name;
          try {
            await movePlannedJpg(root, entry.row);
            progressSnapshot.moved += 1;
            completedRows[entry.index] = { ...entry.row, status: "moved", reason: "JPG전체로 옮겼습니다." };
          } catch (error) {
            progressSnapshot.conflicts += 1;
            completedRows[entry.index] = { ...entry.row, status: "conflict", reason: error instanceof Error ? error.message : "옮기지 못했습니다." };
          }
          progressSnapshot.processed += 1;
          paintProgress();
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(LOCAL_MOVE_CONCURRENCY, pendingMoves.length) },
        () => moveNext(),
      ));

      paintProgress(true);
      const resultPlan = { rows: completedRows, rawUntouched: plan.rawUntouched, hiddenExcluded: plan.hiddenExcluded };
      setPlan(resultPlan);

      if (stopRequestedRef.current) {
        setPhase("stopped");
        setMessage(`중지했습니다. ${total.toLocaleString("ko-KR")}개 중 ${progressSnapshot.moved.toLocaleString("ko-KR")}개를 옮겼습니다. 다시 실행하면 남은 것만 이어서 합니다.`);
        return;
      }

      const resultDirectory = await root.getDirectoryHandle(JPG_INTEGRATED_DIRECTORY, { create: true });
      setDestination(resultDirectory);
      setCurrentLocalFolder(resultDirectory);
      const failures = completedRows.filter((row) => row.status === "conflict").length;
      setPhase(failures ? "failed" : "done");
      setMessage([
        failures
          ? `${progressSnapshot.moved.toLocaleString("ko-KR")}개를 옮겼고 ${failures.toLocaleString("ko-KR")}개는 충돌로 남겼습니다.`
          : `JPG정리가 끝났습니다. RAW ${plan.rawUntouched.toLocaleString("ko-KR")}개는 원래 자리에 그대로 있습니다.`,
        plan.hiddenExcluded > 0 ? `맥 숨김파일 ${plan.hiddenExcluded.toLocaleString("ko-KR")}개는 제외했습니다.` : null,
      ].filter(Boolean).join("\n"));
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "JPG정리를 완료하지 못했습니다.");
    }
  }, [plan, remote, remoteSelection, root, setCurrentLocalFolder]);

  return (
    <section className={styles.surface}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><FolderInput size={19} aria-hidden="true" /></span>
        <span><h2>JPG정리</h2><p>RAW는 그대로 두고 JPG만 모읍니다</p></span>
        <span className={styles.folder}>현재 작업 폴더: <strong>{selectedName ?? "선택 안 됨"}</strong></span>
      </header>

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section className={styles.section}>
            <h3 className={styles.stepTitle}><span className={styles.stepNumber}>1</span> {bridgeEmbedded ? "현재 Bridge 폴더" : "폴더 선택"}</h3>
            <p className={styles.sectionDescription}>{bridgeEmbedded ? "Bridge에서 열어 둔 촬영 폴더를 그대로 사용합니다." : "RAW와 JPG가 섞여 있는 촬영 폴더 하나를 선택합니다."}</p>
            <div className={styles.folderSelection}>
              <span><FolderOpen size={16} aria-hidden="true" />{selectedName ?? "폴더가 선택되지 않았습니다."}</span>
              {!bridgeEmbedded ? <button type="button" className={styles.secondary} onClick={() => void chooseFolder()} disabled={busy || (!remote && !supported)}>
                {selectedName ? "폴더 바꾸기" : "폴더 선택"}
              </button> : null}
            </div>
            {pickerError ? <p className={styles.inlineError}>{pickerError}</p> : null}
          </section>

          <section className={styles.section}>
            <h3 className={styles.stepTitle}><span className={styles.stepNumber}>2</span> 옵션</h3>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={includeSubdirectories} onChange={(event) => { setIncludeSubdirectories(event.target.checked); setPlan(null); }} disabled={remote || busy} />
              <span><strong>하위 폴더까지 모두 처리</strong><small>최대 5단계까지 확인합니다.</small></span>
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={preserveStructure} onChange={(event) => { setPreserveStructure(event.target.checked); setPlan(null); }} disabled={remote || busy} />
              <span><strong>하위 폴더 구조를 유지해서 모으기</strong><small>JPG전체 아래에 원래 상대경로를 유지합니다.</small></span>
            </label>
            {remote ? <p className={styles.sectionDescription}>Mac Studio 작업은 안전을 위해 두 옵션을 항상 켠 상태로 실행합니다.</p> : null}
          </section>
        </div>

        <aside className={styles.preview}>
          <div className={styles.previewHeading}><h3>3. 결과</h3><span>{plan?.rows.length ?? 0}개 확인</span></div>
          {showRunProgress && runProgress ? (
            <div className={`${styles.runProgressPanel} ${phase === "failed" ? styles.runProgressFailed : ""}`}>
              <strong>{phase === "failed" ? "JPG정리 중 오류" : "JPG정리 중"}</strong>
              <div className={styles.runProgressBar} role="progressbar" aria-label="JPG정리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runPercent}>
                <i style={{ width: `${runPercent}%` }} />
              </div>
              <div className={styles.runProgressCount}><b>{runPercent}%</b><span>{runProgress.processed.toLocaleString("ko-KR")} / {runProgress.total.toLocaleString("ko-KR")}</span></div>
              <p title={runProgress.currentName}>{runProgress.currentName || "파일을 준비하는 중입니다."}</p>
              <div className={styles.runProgressStats}>
                <span>옮김 {runProgress.moved.toLocaleString("ko-KR")}</span>
                <span>건너뜀 {runProgress.skipped.toLocaleString("ko-KR")}</span>
                <span>충돌 {runProgress.conflicts.toLocaleString("ko-KR")}</span>
              </div>
              {phase === "running" ? <button type="button" className={styles.stopButton} onClick={() => { stopRequestedRef.current = true; }}><Square size={11} fill="currentColor" />중지</button> : null}
              {phase === "failed" ? <div className={`${styles.message} ${styles.messageError}`}><TriangleAlert size={15} aria-hidden="true" /><span>{message}</span></div> : null}
            </div>
          ) : (
            <>
              <div className={styles.stats}>
                <Stat label={phase === "done" || phase === "failed" || phase === "stopped" ? "옮김" : "옮길 JPG"} value={phase === "stopped" ? (runProgress?.moved ?? 0) : stats.moved} />
                <Stat label="건너뜀" value={stats.skipped} tone="skip" />
                <Stat label="RAW 그대로" value={stats.rawUntouched} />
                <Stat label="충돌" value={stats.conflicts} tone="danger" />
              </div>
              <div className={styles.resultTable} role="region" aria-label="JPG정리 결과">
                <div className={styles.resultTableHeader}><span>파일명</span><span>옮긴 곳</span><span>상태</span></div>
                {(plan?.rows.length ?? 0) > 0 ? visibleRows.map((row, index) => (
                  <div className={styles.resultTableRow} key={`${row.destinationPath}-${index}`}>
                    <span title={row.name}>{row.name}</span>
                    <span title={row.destinationPath}>{row.destinationPath}</span>
                    <span data-status={row.status}>{row.status === "move" ? "옮김 예정" : row.status === "moved" ? "완료" : row.status === "skip" ? "건너뜀" : "충돌"}</span>
                  </div>
                )) : <p className={styles.emptyResult}>미리보기를 실행하면 파일별 결과가 여기에 표시됩니다.</p>}
                {hiddenRowCount > 0 ? <p className={styles.moreResults}>… 외 {hiddenRowCount.toLocaleString("ko-KR")}개</p> : null}
              </div>
            </>
          )}
          {!showRunProgress ? (
            <div className={`${styles.message} ${phase === "failed" ? styles.messageError : phase === "done" ? styles.messageDone : ""}`}>
              {busy ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" /> : phase === "failed" ? <TriangleAlert size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
              <span>{message}</span>
            </div>
          ) : null}
        </aside>
      </div>

      <footer className={styles.actions}>
        <span>{remote ? "Mac Studio는 기존 PHOTO_PREPARE_SOURCE 워커 경로를 사용합니다." : "RAW는 세기만 하며 이동·복사·삭제하지 않습니다."}</span>
        <div>
          {!remote && destination ? (
            <button type="button" className={styles.primary} onClick={onOpenPhotoSelect}>사진 셀렉으로 이동</button>
          ) : (
            <>
              <button type="button" className={styles.secondary} onClick={() => void preview()} disabled={busy || !(remote ? remoteSelection : root)}>미리보기</button>
              <button type="button" className={styles.primary} onClick={() => void run()} disabled={busy || (phase !== "ready" && phase !== "stopped") || (!remote && !plan) || !(remote ? remoteSelection : root)}>JPG정리 실행</button>
            </>
          )}
        </div>
      </footer>

      {remotePickerOpen ? (
        <PhotoSourcePicker
          onCancel={() => setRemotePickerOpen(false)}
          onSelectRemote={(selection) => {
            setRemoteSelection(selection);
            setRemotePickerOpen(false);
            setPhase("idle");
            setPlan(null);
            setRunProgress(null);
            setMessage("미리보기를 눌러 Mac Studio JPG정리를 준비하세요.");
          }}
        />
      ) : null}
    </section>
  );
}
