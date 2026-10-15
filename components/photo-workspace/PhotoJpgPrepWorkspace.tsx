"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, FolderInput, FolderOpen, Loader2, TriangleAlert } from "lucide-react";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { moveFileFast } from "@/lib/photo-classifier/file-move";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { CAMERA_JPG_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo/extensions";
import { usePhotoFolderPicker } from "@/lib/photo/useFolderPicker";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./WorkspaceSurface.module.css";

type Phase = "idle" | "scanning" | "ready" | "running" | "done" | "failed";
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
};

type Stats = { moved: number; skipped: number; rawUntouched: number; conflicts: number };

const EMPTY_STATS: Stats = { moved: 0, skipped: 0, rawUntouched: 0, conflicts: 0 };
const MAX_DEPTH = 5;

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
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

async function collectSources(root: FileSystemDirectoryHandle, includeSubdirectories: boolean): Promise<{ jpgs: SourceJpg[]; rawUntouched: number }> {
  const jpgs: SourceJpg[] = [];
  let rawUntouched = 0;

  const visit = async (directory: FileSystemDirectoryHandle, relativeDirectory: string[], depth: number): Promise<void> => {
    for await (const [name, handle] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind === "directory") {
        if (name.normalize("NFC") === JPG_INTEGRATED_DIRECTORY.normalize("NFC")) continue;
        if (includeSubdirectories && depth < MAX_DEPTH) {
          await visit(handle as FileSystemDirectoryHandle, [...relativeDirectory, name], depth + 1);
        }
        continue;
      }

      const fileExtension = extension(name);
      if (RAW_PHOTO_EXTENSIONS.has(fileExtension)) {
        rawUntouched += 1;
        continue;
      }
      if (!CAMERA_JPG_EXTENSIONS.has(fileExtension)) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      jpgs.push({
        fileHandle: handle as FileSystemFileHandle,
        sourceDirectory: directory,
        name,
        size: file.size,
        lastModified: file.lastModified,
        relativeDirectory,
      });
    }
  };

  await visit(root, [], 0);
  return { jpgs, rawUntouched };
}

export async function buildJpgPrepPlan(
  root: FileSystemDirectoryHandle,
  options: { includeSubdirectories: boolean; preserveStructure: boolean },
): Promise<PrepPlan> {
  const { jpgs, rawUntouched } = await collectSources(root, options.includeSubdirectories);
  const plannedDestination = new Map<string, SourceJpg>();
  const rows: PlanRow[] = [];

  for (const jpg of jpgs) {
    const destinationDirectory = options.preserveStructure ? jpg.relativeDirectory : [];
    const destinationPath = [JPG_INTEGRATED_DIRECTORY, ...destinationDirectory, jpg.name].join("/");
    const destinationKey = destinationPath.normalize("NFC").toLocaleLowerCase("en-US");
    const duplicatePlan = plannedDestination.get(destinationKey);
    if (duplicatePlan) {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: `다른 원본과 목적지 이름이 같습니다: ${duplicatePlan.name}` });
      continue;
    }
    plannedDestination.set(destinationKey, jpg);

    const existing = await existingDestination(root, destinationDirectory, jpg.name);
    if (existing === "directory") {
      rows.push({ ...jpg, destinationDirectory, destinationPath, status: "conflict", reason: "같은 이름의 폴더가 있습니다." });
    } else if (existing) {
      const identical = existing.size === jpg.size && existing.lastModified === jpg.lastModified;
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
  return { rows, rawUntouched };
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

export default function PhotoJpgPrepWorkspace({ onOpenPhotoSelect }: { onOpenPhotoSelect: () => void }) {
  const { executionMode, setCurrentLocalFolder } = usePhotoStudioExecution();
  const remote = executionMode === "REMOTE_WORKER";
  const { supported, pick, error: pickerError } = usePhotoFolderPicker();
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [remoteSelection, setRemoteSelection] = useState<RemoteNasSelection | null>(null);
  const [remotePickerOpen, setRemotePickerOpen] = useState(false);
  const [includeSubdirectories, setIncludeSubdirectories] = useState(true);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("폴더를 선택한 뒤 미리보기로 JPG와 RAW를 확인하세요.");
  const [plan, setPlan] = useState<PrepPlan | null>(null);
  const [destination, setDestination] = useState<FileSystemDirectoryHandle | null>(null);
  const [processed, setProcessed] = useState(0);

  const stats = useMemo(() => statsFor(plan), [plan]);
  const selectedName = remote ? remoteSelection?.displayPath : root?.name;
  const busy = phase === "scanning" || phase === "running";

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
    setPhase("idle");
    setMessage("미리보기를 눌러 옮길 JPG와 그대로 둘 RAW를 확인하세요.");
  }, [pick, remote, setCurrentLocalFolder]);

  const preview = useCallback(async () => {
    if (remote) {
      if (!remoteSelection) return;
      setPlan(null);
      setPhase("ready");
      setMessage("Mac Studio는 실행할 때 JPG·RAW를 확인하고 기존 워커 경로로 안전하게 정리합니다.");
      return;
    }
    if (!root) return;
    setPhase("scanning");
    setMessage("폴더를 훑어 JPG·RAW와 충돌을 확인하는 중입니다.");
    try {
      const nextPlan = await buildJpgPrepPlan(root, { includeSubdirectories, preserveStructure });
      setPlan(nextPlan);
      setPhase("ready");
      setMessage(nextPlan.rows.length === 0
        ? "옮길 JPG가 없습니다. RAW와 다른 파일은 그대로 두었습니다."
        : `JPG ${nextPlan.rows.length.toLocaleString("ko-KR")}개를 확인했습니다. RAW ${nextPlan.rawUntouched.toLocaleString("ko-KR")}개는 그대로 둡니다.`);
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "폴더를 확인하지 못했습니다.");
    }
  }, [includeSubdirectories, preserveStructure, remote, remoteSelection, root]);

  const run = useCallback(async () => {
    if (remote) {
      if (!remoteSelection) return;
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

    if (!root) return;
    setPhase("running");
    setProcessed(0);
    setMessage("JPG만 JPG전체로 옮기는 중입니다. RAW는 건드리지 않습니다.");
    try {
      const latest = await buildJpgPrepPlan(root, { includeSubdirectories, preserveStructure });
      const completedRows: PlanRow[] = [];
      let movedCount = 0;
      for (const row of latest.rows) {
        if (row.status !== "move") {
          completedRows.push(row);
          continue;
        }
        try {
          await movePlannedJpg(root, row);
          movedCount += 1;
          completedRows.push({ ...row, status: "moved", reason: "JPG전체로 옮겼습니다." });
          setProcessed(movedCount);
        } catch (error) {
          completedRows.push({ ...row, status: "conflict", reason: error instanceof Error ? error.message : "옮기지 못했습니다." });
        }
      }
      const resultPlan = { rows: completedRows, rawUntouched: latest.rawUntouched };
      setPlan(resultPlan);
      setProcessed(movedCount);
      const resultDirectory = await root.getDirectoryHandle(JPG_INTEGRATED_DIRECTORY, { create: true });
      setDestination(resultDirectory);
      setCurrentLocalFolder(resultDirectory);
      const failures = completedRows.filter((row) => row.status === "conflict").length;
      setPhase(failures ? "failed" : "done");
      setMessage(failures
        ? `${movedCount.toLocaleString("ko-KR")}개를 옮겼고 ${failures.toLocaleString("ko-KR")}개는 충돌로 남겼습니다.`
        : `JPG정리가 끝났습니다. RAW ${latest.rawUntouched.toLocaleString("ko-KR")}개는 원래 자리에 그대로 있습니다.`);
    } catch (error) {
      setPhase("failed");
      setMessage(error instanceof Error ? error.message : "JPG정리를 완료하지 못했습니다.");
    }
  }, [includeSubdirectories, preserveStructure, remote, remoteSelection, root, setCurrentLocalFolder]);

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
            <h3 className={styles.stepTitle}><span className={styles.stepNumber}>1</span> 폴더 선택</h3>
            <p className={styles.sectionDescription}>RAW와 JPG가 섞여 있는 촬영 폴더 하나를 선택합니다.</p>
            <button type="button" className={styles.secondary} onClick={() => void chooseFolder()} disabled={busy || (!remote && !supported)}>
              <FolderOpen size={16} aria-hidden="true" /> {selectedName ? "폴더 바꾸기" : "폴더 선택"}
            </button>
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
          <div className={styles.stats}>
            <Stat label={phase === "done" || phase === "failed" ? "옮김" : "옮길 JPG"} value={phase === "done" || phase === "failed" ? processed : stats.moved} />
            <Stat label="건너뜀" value={stats.skipped} tone="skip" />
            <Stat label="RAW 그대로" value={stats.rawUntouched} />
            <Stat label="충돌" value={stats.conflicts} tone="danger" />
          </div>
          <div className={styles.resultTable} role="region" aria-label="JPG정리 결과">
            <div className={styles.resultTableHeader}><span>파일명</span><span>옮긴 곳</span><span>상태</span></div>
            {(plan?.rows.length ?? 0) > 0 ? plan?.rows.map((row, index) => (
              <div className={styles.resultTableRow} key={`${row.destinationPath}-${index}`}>
                <span title={row.name}>{row.name}</span>
                <span title={row.destinationPath}>{row.destinationPath}</span>
                <span data-status={row.status}>{row.status === "move" ? "옮김 예정" : row.status === "moved" ? "완료" : row.status === "skip" ? "건너뜀" : "충돌"}</span>
              </div>
            )) : <p className={styles.emptyResult}>미리보기를 실행하면 파일별 결과가 여기에 표시됩니다.</p>}
          </div>
          <div className={`${styles.message} ${phase === "failed" ? styles.messageError : phase === "done" ? styles.messageDone : ""}`}>
            {busy ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" /> : phase === "failed" ? <TriangleAlert size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
            <span>{message}</span>
          </div>
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
              <button type="button" className={styles.primary} onClick={() => void run()} disabled={busy || phase !== "ready" || !(remote ? remoteSelection : root)}>JPG정리 실행</button>
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
            setMessage("미리보기를 눌러 Mac Studio JPG정리를 준비하세요.");
          }}
        />
      ) : null}
    </section>
  );
}
