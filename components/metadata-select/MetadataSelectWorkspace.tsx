"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, RotateCcw, XCircle } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import { scanJpgFiles, scanRawFiles, type ScannedFile } from "@/lib/metadataSelect/folderScan";
import { readExifDateTime } from "@/lib/metadataSelect/readExifDateTime";
import {
  assertNoDestinationCollisions,
  MetadataFileOperationError,
  removeTransferredCopies,
  transferFilesSafely,
  type MetadataFileTransfer,
} from "@/lib/metadataSelect/fileOperations";
import { validateMetadataSelectFolders } from "@/lib/metadataSelect/folderValidation";
import {
  buildOriginalIndex,
  buildRawIndexByBasename,
  matchSelectionToRaw,
  type MetadataSelectRow,
  type MetadataSelectStatus,
} from "@/lib/metadataSelect/matcher";
import {
  JPG_INTEGRATED_DIRECTORY,
  JPG_RETOUCHED_DIRECTORY,
  SELECTED_RAW_DIRECTORY,
} from "@/lib/photo-classifier/node/storageLayout";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { C, R } from "@/lib/theme";

type Phase =
  | "idle"
  | "analyzing"
  | "awaiting_confirmation"
  | "copying_raw"
  | "moving_jpg"
  | "restoring_jpg"
  | "done"
  | "failed";

type MatchPlan = {
  kind: "match";
  rows: MetadataSelectRow[];
  selectionCount: number;
  rawTransfers: MetadataFileTransfer[];
  jpgTransfers: MetadataFileTransfer[];
  excludeCompleted: boolean;
};

type RestorePlan = {
  kind: "restore";
  transfers: MetadataFileTransfer[];
  source: FileSystemDirectoryHandle;
  destination: FileSystemDirectoryHandle;
};

type OperationPlan = MatchPlan | RestorePlan;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  analyzing: "촬영시간과 원본을 분석하는 중...",
  awaiting_confirmation: "분석 완료 · 확인 대기",
  copying_raw: "RAW 복사 중...",
  moving_jpg: "작업 완료 JPG를 제외하는 중...",
  restoring_jpg: "보정완료 JPG를 복구하는 중...",
  done: "완료",
  failed: "실패",
};

const STATUS_META: Record<MetadataSelectStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  success: { label: "매칭 성공", icon: CheckCircle2, color: C.success },
  needs_review: { label: "확인 필요", icon: HelpCircle, color: C.gold },
  metadata_missing: { label: "메타데이터 없음", icon: XCircle, color: C.hint },
  raw_missing: { label: "RAW 미발견", icon: AlertTriangle, color: C.orange },
  error: { label: "오류", icon: XCircle, color: C.danger },
};

function leafName(name: string): string {
  return name.split("/").pop() ?? name;
}

function errorMessage(error: unknown): string {
  if (error instanceof MetadataFileOperationError && error.rollbackFailures.length > 0) {
    return `${error.message}\n롤백하지 못한 파일: ${error.rollbackFailures.join(", ")}`;
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

function isNotFound(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && error.name === "NotFoundError";
}

async function getDirectoryIfExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (parent as any).getDirectoryHandle(name) as FileSystemDirectoryHandle;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function findScannedFile(files: readonly ScannedFile[], name: string | undefined): ScannedFile | undefined {
  return name ? files.find((file) => file.name === name) : undefined;
}

function toTransfer(file: ScannedFile): MetadataFileTransfer {
  return { name: leafName(file.name), sourceDirectory: file.parent, sourceHandle: file.handle };
}

function Btn({ children, onClick, disabled, style }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 20px",
        minHeight: 38,
        fontSize: 13,
        fontWeight: 700,
        borderRadius: R.md,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        background: disabled ? C.border : C.teal,
        color: disabled ? C.hint : C.white,
        opacity: disabled ? 0.6 : 1,
        transition: "opacity .15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function FolderPickerRow({ step, label, dir, onPick, disabled }: {
  step: number;
  label: string;
  dir: FileSystemDirectoryHandle | null;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: C.teal,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
      }}>
        {step}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{label}</div>
        {dir ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{dir.name}</div> : null}
      </div>
      <Btn onClick={onPick} disabled={disabled}>{dir ? `✅ ${dir.name}` : "📂 폴더 선택"}</Btn>
    </div>
  );
}

export default function MetadataSelectWorkspace() {
  const desktopWindowMode = useDesktopWindowMode();
  const [hasFS, setHasFS] = useState(false);
  const [excludeCompleted, setExcludeCompleted] = useState(false);
  const [selectionDir, setSelectionDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [sourceDir, setSourceDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState("");
  const [rows, setRows] = useState<MetadataSelectRow[]>([]);
  const [plan, setPlan] = useState<OperationPlan | null>(null);
  const [error, setError] = useState("");
  const [restoreCount, setRestoreCount] = useState(0);
  const [refreshRestore, setRefreshRestore] = useState(0);

  useEffect(() => {
    setHasFS("showDirectoryPicker" in window);
  }, []);

  const running = phase === "analyzing" || phase === "copying_raw" || phase === "moving_jpg" || phase === "restoring_jpg";
  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!hasFS) missing.push("Chrome 또는 Edge에서 열어주세요.");
    if (!selectionDir) missing.push("고객 선택본을 지정해주세요.");
    if (!sourceDir) missing.push(excludeCompleted ? "프로젝트 폴더를 지정해주세요." : "원본 JPG 폴더를 지정해주세요.");
    if (!rawDir) missing.push("RAW 원본을 지정해주세요.");
    return missing;
  }, [excludeCompleted, hasFS, rawDir, selectionDir, sourceDir]);

  useEffect(() => {
    let cancelled = false;
    if (!excludeCompleted || !sourceDir || running) {
      setRestoreCount(0);
      return () => { cancelled = true; };
    }
    void (async () => {
      try {
        const retouched = await getDirectoryIfExists(sourceDir, JPG_RETOUCHED_DIRECTORY);
        const files = retouched ? await scanJpgFiles(retouched, 0) : [];
        if (!cancelled) setRestoreCount(files.length);
      } catch {
        if (!cancelled) setRestoreCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [excludeCompleted, refreshRestore, running, sourceDir]);

  const resetAnalysis = () => {
    setPlan(null);
    setRows([]);
    setError("");
    setPhaseDetail("");
    setPhase("idle");
  };

  const pick = async (setter: (dir: FileSystemDirectoryHandle) => void, mode: "readwrite" | "read") => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode }) as FileSystemDirectoryHandle;
      setter(dir);
      resetAnalysis();
    } catch (pickError) {
      if (pickError && typeof pickError === "object" && "name" in pickError && pickError.name === "AbortError") return;
      setError("폴더 선택에 실패했습니다.");
      setPhase("failed");
    }
  };

  const toggleExclude = (checked: boolean) => {
    if (running) return;
    setExcludeCompleted(checked);
    setSourceDir(null);
    resetAnalysis();
  };

  async function analyze() {
    if (!selectionDir || !sourceDir || !rawDir || missingRequirements.length > 0) return;
    setError("");
    setRows([]);
    setPlan(null);
    setPhase("analyzing");
    setPhaseDetail("원본 JPG 촬영시간을 읽고 있습니다.");

    try {
      const projectDir = excludeCompleted ? sourceDir : null;
      let originalDir = sourceDir;
      if (projectDir) {
        try {
          originalDir = await (projectDir as any).getDirectoryHandle(JPG_INTEGRATED_DIRECTORY) as FileSystemDirectoryHandle;
        } catch (directoryError) {
          if (isNotFound(directoryError)) throw new Error(`프로젝트 폴더에 ${JPG_INTEGRATED_DIRECTORY}/가 없습니다.`);
          throw directoryError;
        }
      }

      await validateMetadataSelectFolders({ selectionDir, sourceDir: originalDir, rawDir, projectDir });
      const originalFiles = await scanJpgFiles(originalDir, excludeCompleted ? 0 : 5);
      const originalEntries: { name: string; normalizedDateTime: string | null }[] = [];
      for (const item of originalFiles) {
        let normalizedDateTime: string | null = null;
        try {
          normalizedDateTime = await readExifDateTime(await item.handle.getFile());
        } catch {
          normalizedDateTime = null;
        }
        originalEntries.push({ name: item.name, normalizedDateTime });
      }
      const originalIndex = buildOriginalIndex(originalEntries);

      setPhaseDetail("RAW 원본 파일명을 확인하고 있습니다.");
      const rawFiles = await scanRawFiles(rawDir);
      const rawIndex = buildRawIndexByBasename(rawFiles, SELECT_MATCH_RAW_EXTENSIONS);

      setPhaseDetail("고객 선택본의 EXIF와 원본을 대조하고 있습니다.");
      const selectionFiles = await scanJpgFiles(selectionDir);
      if (selectionFiles.length === 0) throw new Error("고객 선택본 폴더에서 JPG를 찾지 못했습니다.");

      const nextRows: MetadataSelectRow[] = [];
      for (const item of selectionFiles) {
        try {
          const normalizedDateTime = await readExifDateTime(await item.handle.getFile());
          nextRows.push(matchSelectionToRaw(item.name, normalizedDateTime, originalIndex, rawIndex));
        } catch (selectionError) {
          nextRows.push({
            selectionName: item.name,
            status: "error",
            normalizedDateTime: null,
            message: `EXIF 분석 실패: ${errorMessage(selectionError)}`,
          });
        }
      }
      setRows(nextRows);

      if (excludeCompleted) {
        const failedRows = nextRows.filter((row) => row.status !== "success");
        if (failedRows.length > 0) throw new Error(`매칭 실패 ${failedRows.length}장이 있어 파일을 변경하지 않았습니다.`);
        const duplicateOriginals = nextRows
          .map((row) => row.matchedOriginalName)
          .filter((name): name is string => !!name)
          .filter((name, index, names) => names.indexOf(name) !== index);
        if (duplicateOriginals.length > 0) {
          throw new Error(`같은 원본 JPG에 중복 매칭된 선택본이 있습니다: ${Array.from(new Set(duplicateOriginals)).join(", ")}`);
        }
      }

      const successfulRows = nextRows.filter((row) => row.status === "success");
      if (successfulRows.length === 0) throw new Error("복사할 수 있는 RAW 매칭 결과가 없습니다.");
      const rawTransfers = successfulRows.map((row) => {
        const file = findScannedFile(rawFiles, row.rawName);
        if (!file) throw new Error(`${row.rawName ?? row.selectionName}: RAW 파일 핸들을 찾지 못했습니다.`);
        return toTransfer(file);
      });
      const selectedRaw = await getDirectoryIfExists(rawDir, SELECTED_RAW_DIRECTORY);
      await assertNoDestinationCollisions(selectedRaw, rawTransfers);

      let jpgTransfers: MetadataFileTransfer[] = [];
      if (excludeCompleted) {
        jpgTransfers = successfulRows.map((row) => {
          const file = findScannedFile(originalFiles, row.matchedOriginalName);
          if (!file || file.name.includes("/")) throw new Error(`${row.matchedOriginalName ?? row.selectionName}: ${JPG_INTEGRATED_DIRECTORY}의 평면 원본 JPG가 아닙니다.`);
          return toTransfer(file);
        });
        const retouched = await getDirectoryIfExists(sourceDir, JPG_RETOUCHED_DIRECTORY);
        await assertNoDestinationCollisions(retouched, jpgTransfers);
      }

      setPlan({ kind: "match", rows: nextRows, selectionCount: selectionFiles.length, rawTransfers, jpgTransfers, excludeCompleted });
      setPhaseDetail("");
      setPhase("awaiting_confirmation");
    } catch (analysisError) {
      setError(errorMessage(analysisError));
      setPhaseDetail("");
      setPhase("failed");
    }
  }

  async function executeMatch() {
    if (!rawDir || !sourceDir || plan?.kind !== "match") return;
    setError("");
    let selectedRaw: FileSystemDirectoryHandle | null = null;
    let rawCreatedNames: string[] = [];
    try {
      setPhase("copying_raw");
      selectedRaw = await (rawDir as any).getDirectoryHandle(SELECTED_RAW_DIRECTORY, { create: true }) as FileSystemDirectoryHandle;
      const rawResult = await transferFilesSafely({
        transfers: plan.rawTransfers,
        destination: selectedRaw,
        deleteSources: false,
        onProgress: (current, total, name) => setPhaseDetail(`${current} / ${total} · ${name}`),
      });
      rawCreatedNames = rawResult.createdNames;

      if (plan.excludeCompleted) {
        setPhase("moving_jpg");
        const retouched = await (sourceDir as any).getDirectoryHandle(JPG_RETOUCHED_DIRECTORY, { create: true }) as FileSystemDirectoryHandle;
        await transferFilesSafely({
          transfers: plan.jpgTransfers,
          destination: retouched,
          deleteSources: true,
          onProgress: (current, total, name) => setPhaseDetail(`${current} / ${total} · ${name}`),
        });
      }

      setRows(plan.rows);
      setPlan(null);
      setPhaseDetail("");
      setPhase("done");
      setRefreshRestore((value) => value + 1);
    } catch (executionError) {
      const cleanupFailures = selectedRaw && rawCreatedNames.length > 0
        ? await removeTransferredCopies(selectedRaw, rawCreatedNames)
        : [];
      const base = errorMessage(executionError);
      setError(cleanupFailures.length > 0 ? `${base}\nRAW 복사본 정리 실패: ${cleanupFailures.join(", ")}` : base);
      setPhaseDetail("");
      setPhase("failed");
    }
  }

  async function prepareRestore() {
    if (!excludeCompleted || !sourceDir) return;
    setError("");
    try {
      const source = await getDirectoryIfExists(sourceDir, JPG_RETOUCHED_DIRECTORY);
      const destination = await getDirectoryIfExists(sourceDir, JPG_INTEGRATED_DIRECTORY);
      if (!source) throw new Error(`${JPG_RETOUCHED_DIRECTORY}/를 찾지 못했습니다.`);
      if (!destination) throw new Error(`${JPG_INTEGRATED_DIRECTORY}/를 찾지 못했습니다.`);
      const files = await scanJpgFiles(source, 0);
      if (files.length === 0) throw new Error("복구할 보정완료 JPG가 없습니다.");
      const transfers = files.map(toTransfer);
      await assertNoDestinationCollisions(destination, transfers);
      setRows([]);
      setPlan({ kind: "restore", transfers, source, destination });
      setPhase("awaiting_confirmation");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
      setPhase("failed");
    }
  }

  async function executeRestore() {
    if (plan?.kind !== "restore") return;
    setError("");
    setPhase("restoring_jpg");
    try {
      await transferFilesSafely({
        transfers: plan.transfers,
        destination: plan.destination,
        deleteSources: true,
        onProgress: (current, total, name) => setPhaseDetail(`${current} / ${total} · ${name}`),
      });
      setPlan(null);
      setPhaseDetail("");
      setPhase("done");
      setRefreshRestore((value) => value + 1);
    } catch (restoreError) {
      setError(errorMessage(restoreError));
      setPhaseDetail("");
      setPhase("failed");
    }
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {} as Record<MetadataSelectStatus, number>);
  const canAnalyze = missingRequirements.length === 0 && !running && phase !== "awaiting_confirmation";

  return (
    <main
      className="pc-page"
      data-metadata-select-surface={desktopWindowMode ? "window" : "standalone"}
      style={{ background: "#2A2A2A", color: "rgba(255,255,255,.85)", fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}
    >
      {!desktopWindowMode ? <GlobalHeader title="메타데이터 셀렉" description="파일명을 변경한 선택본도 촬영시간 메타데이터로 RAW를 찾습니다." /> : null}
      <div className="pc-content">
        {!hasFS ? (
          <div className="pc-card pc-card--padded" style={{ fontSize: 12, color: C.danger, textAlign: "center" }}>Chrome 또는 Edge를 사용해주세요.</div>
        ) : (
          <section className="pc-card pc-card--padded">
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 0 12px", borderBottom: `1px solid ${C.border}`, color: C.ink }}>
              <span>
                <strong style={{ display: "block", fontSize: 13 }}>이미 작업한 사진 제외</strong>
                <small style={{ display: "block", marginTop: 4, color: C.muted, lineHeight: 1.5 }}>매칭된 원본 JPG를 {JPG_RETOUCHED_DIRECTORY}/로 안전하게 옮깁니다.</small>
              </span>
              <input type="checkbox" checked={excludeCompleted} disabled={running} onChange={(event) => toggleExclude(event.target.checked)} aria-label="이미 작업한 사진 제외" style={{ width: 20, height: 20, accentColor: C.orange }} />
            </label>

            <FolderPickerRow step={1} label="고객 선택본" dir={selectionDir} disabled={running} onPick={() => pick(setSelectionDir, "read")} />
            <FolderPickerRow step={2} label={excludeCompleted ? "프로젝트 폴더" : "원본 JPG"} dir={sourceDir} disabled={running} onPick={() => pick(setSourceDir, excludeCompleted ? "readwrite" : "read")} />
            <FolderPickerRow step={3} label="RAW 원본" dir={rawDir} disabled={running} onPick={() => pick(setRawDir, "readwrite")} />

            <div style={{ marginTop: 16, display: "grid", gap: 6 }} aria-live="polite">
              {missingRequirements.map((message) => <div key={message} style={{ fontSize: 11, color: C.orange }}>• {message}</div>)}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
              <Btn onClick={analyze} disabled={!canAnalyze} style={canAnalyze ? { background: C.orange } : undefined}>
                {phase === "analyzing" ? PHASE_LABEL[phase] : "메타데이터 매칭 분석"}
              </Btn>
              {excludeCompleted && restoreCount > 0 && phase !== "awaiting_confirmation" ? (
                <Btn onClick={prepareRestore} disabled={running} style={{ background: C.white, color: C.teal, border: `1px solid ${C.border}` }}>
                  <RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 5 }} />보정완료 사진 복구 ({restoreCount}장)
                </Btn>
              ) : null}
            </div>

            {running ? <div style={{ marginTop: 12, fontSize: 12, color: C.teal, textAlign: "center" }}>{PHASE_LABEL[phase]}{phaseDetail ? ` · ${phaseDetail}` : ""}</div> : null}
            {error ? <div style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12, color: C.danger, textAlign: "center", lineHeight: 1.7 }}>{error}</div> : null}

            {phase === "awaiting_confirmation" && plan ? (
              <div style={{ marginTop: 18, border: `1px solid ${C.border}`, borderRadius: R.md, background: C.light, padding: 16, color: C.ink }}>
                {plan.kind === "match" ? (
                  <>
                    <strong style={{ display: "block", fontSize: 14 }}>파일을 변경하기 전에 확인해주세요.</strong>
                    <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.9, color: C.muted }}>
                      선택본 {plan.selectionCount}장 · RAW 복사 {plan.rawTransfers.length}장
                      {plan.excludeCompleted ? <> · JPG 제외 {plan.jpgTransfers.length}장<br />대상: {JPG_RETOUCHED_DIRECTORY}/</> : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <Btn onClick={executeMatch} style={{ background: C.orange }}>{plan.excludeCompleted ? `${plan.jpgTransfers.length}장 제외하고 RAW 복사` : `${plan.rawTransfers.length}장 RAW 복사`}</Btn>
                      <Btn onClick={resetAnalysis} style={{ background: C.white, color: C.muted, border: `1px solid ${C.border}` }}>취소</Btn>
                    </div>
                  </>
                ) : (
                  <>
                    <strong style={{ display: "block", fontSize: 14 }}>보정완료 JPG {plan.transfers.length}장을 복구할까요?</strong>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: C.muted }}>{JPG_INTEGRATED_DIRECTORY}/로 되돌립니다. RAW 복사본은 건드리지 않습니다.</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <Btn onClick={executeRestore} style={{ background: C.orange }}>{plan.transfers.length}장 복구</Btn>
                      <Btn onClick={resetAnalysis} style={{ background: C.white, color: C.muted, border: `1px solid ${C.border}` }}>취소</Btn>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <div style={{ marginTop: 16, background: C.light, borderRadius: R.sm, padding: "12px 14px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
              <Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />파일명이 아니라 사진 내부 EXIF의 촬영시간(DateTimeOriginal)으로 원본 JPG와 RAW를 찾습니다. RAW 원본은 유지하고 <strong>{SELECTED_RAW_DIRECTORY}/</strong>에 복사합니다.
            </div>
          </section>
        )}

        {rows.length > 0 ? (
          <section className="pc-card pc-card--padded" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 18, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>총 선택본</span> <strong>{rows.length}</strong></div>
              {(Object.keys(STATUS_META) as MetadataSelectStatus[]).filter((status) => counts[status]).map((status) => (
                <div key={status}><span style={{ color: C.muted }}>{STATUS_META[status].label}</span>{" "}<strong style={{ color: STATUS_META[status].color }}>{counts[status]}</strong></div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row) => {
                const meta = STATUS_META[row.status];
                const Icon = meta.icon;
                return (
                  <div key={row.selectionName} style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: R.sm }}>
                    <Icon size={16} color={meta.color} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: C.ink }}>{row.selectionName}</div>
                      {row.status === "success" ? (
                        <div style={{ color: C.muted, marginTop: 2, lineHeight: 1.7 }}>→ {row.matchedOriginalName && leafName(row.matchedOriginalName)}<br />→ {row.rawName && leafName(row.rawName)}</div>
                      ) : (
                        <div style={{ color: C.muted, marginTop: 2 }}>{row.message}{row.candidateNames?.length ? <span>: {row.candidateNames.map(leafName).join(", ")}</span> : null}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
