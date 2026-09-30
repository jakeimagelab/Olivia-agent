"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from "lucide-react";
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
  buildDateTimeIndex,
  buildOriginalIndex,
  buildRawIndexByBasename,
  matchSelectionDateTimeToRaw,
  matchSelectionNameToRaw,
  matchSelectionToRaw,
  markDuplicateRawMatches,
  rawNamesOf,
  uniqueRawNames,
  type MetadataSelectRow,
  type MetadataSelectStatus,
} from "@/lib/metadataSelect/matcher";
import {
  planMetadataRawOutput,
  type MetadataRawTransferMode,
} from "@/lib/metadataSelect/rawOutputPlan";
import {
  FINISHED_RAW_DIRECTORY,
  SELECTED_RAW_DIRECTORY,
} from "@/lib/photo-classifier/node/storageLayout";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { C, R } from "@/lib/theme";

type Phase =
  | "idle"
  | "analyzing"
  | "awaiting_confirmation"
  | "copying_raw"
  | "moving_finished_raw"
  | "done"
  | "failed";

type MatchPlan = {
  rows: MetadataSelectRow[];
  selectionCount: number;
  rawCopyTransfers: MetadataFileTransfer[];
  rawMoveTransfers: MetadataFileTransfer[];
  destinationDirectory: typeof SELECTED_RAW_DIRECTORY | typeof FINISHED_RAW_DIRECTORY;
  alreadyFinishedCount: number;
  matchedRawCount: number;
  burstExtraCount: number;
  skippedCount: number;
  excludeCompleted: boolean;
  transferMode: MetadataRawTransferMode;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  analyzing: "촬영시간과 원본을 분석하는 중...",
  awaiting_confirmation: "분석 완료 · 확인 대기",
  copying_raw: "RAW 복사 중...",
  moving_finished_raw: "RAW 이동 중...",
  done: "완료",
  failed: "실패",
};

const STATUS_META: Record<MetadataSelectStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  success: { label: "매칭 성공", icon: CheckCircle2, color: C.success },
  already_finished: { label: "작업 완료 제외", icon: CheckCircle2, color: C.teal },
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

function normalizedLeafKey(name: string): string {
  return leafName(name).normalize("NFC").toLocaleLowerCase("en-US");
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

function FolderPickerRow({ step, label, hint, dir, onPick, onClear, disabled }: {
  step: number;
  label: string;
  hint?: string;
  dir: FileSystemDirectoryHandle | null;
  onPick: () => void;
  onClear?: () => void;
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
        {dir || hint ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{dir?.name ?? hint}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {dir && onClear ? <Btn onClick={onClear} disabled={disabled} style={{ background: C.white, color: C.muted, border: `1px solid ${C.border}`, paddingInline: 12 }}>선택 해제</Btn> : null}
        <Btn onClick={onPick} disabled={disabled}>{dir ? `✅ ${dir.name}` : "📂 폴더 선택"}</Btn>
      </div>
    </div>
  );
}

export default function MetadataSelectWorkspace() {
  const desktopWindowMode = useDesktopWindowMode();
  const [hasFS, setHasFS] = useState(false);
  const [excludeCompleted, setExcludeCompleted] = useState(false);
  const [transferMode, setTransferMode] = useState<MetadataRawTransferMode>("copy");
  const [selectionDir, setSelectionDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [sourceDir, setSourceDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState("");
  const [rows, setRows] = useState<MetadataSelectRow[]>([]);
  const [plan, setPlan] = useState<MatchPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setHasFS("showDirectoryPicker" in window);
  }, []);

  const running = phase === "analyzing" || phase === "copying_raw" || phase === "moving_finished_raw";
  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!hasFS) missing.push("Chrome 또는 Edge에서 열어주세요.");
    if (!selectionDir) missing.push("선택본을 지정해주세요.");
    if (!rawDir) missing.push("RAW 원본을 지정해주세요.");
    return missing;
  }, [hasFS, rawDir, selectionDir]);

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
    resetAnalysis();
  };

  const changeTransferMode = (nextMode: MetadataRawTransferMode) => {
    if (running || excludeCompleted || nextMode === transferMode) return;
    setTransferMode(nextMode);
    resetAnalysis();
  };

  async function analyze() {
    if (!selectionDir || !rawDir || missingRequirements.length > 0) return;
    setError("");
    setRows([]);
    setPlan(null);
    setPhase("analyzing");
    setPhaseDetail(sourceDir ? "원본 JPG 촬영시간을 읽고 있습니다." : "선택본 파일명을 확인하고 있습니다.");

    try {
      await validateMetadataSelectFolders({ selectionDir, sourceDir, rawDir });
      const originalFiles = sourceDir ? await scanJpgFiles(sourceDir) : [];
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

      setPhaseDetail(sourceDir ? "선택본의 EXIF와 원본 JPG를 대조하고 있습니다." : "선택본과 RAW 파일명을 대조하고 있습니다.");
      const selectionFiles = await scanJpgFiles(selectionDir);
      if (selectionFiles.length === 0) throw new Error("선택본 폴더에서 JPG를 찾지 못했습니다.");

      const nextRows: MetadataSelectRow[] = [];
      if (!sourceDir) {
        const directRows = selectionFiles.map((item) => matchSelectionNameToRaw(item.name, rawIndex));
        const needsExifFallback = directRows.some((row) => row.status === "raw_missing");
        let rawDateTimeIndex = new Map<string, string[]>();

        if (needsExifFallback) {
          setPhaseDetail("파일명이 바뀐 선택본을 위해 RAW 촬영시간을 확인하고 있습니다.");
          const rawDateEntries: { name: string; normalizedDateTime: string | null }[] = [];
          for (const item of rawFiles) {
            let normalizedDateTime: string | null = null;
            try {
              normalizedDateTime = await readExifDateTime(await item.handle.getFile());
            } catch {
              normalizedDateTime = null;
            }
            rawDateEntries.push({ name: item.name, normalizedDateTime });
          }
          rawDateTimeIndex = buildDateTimeIndex(rawDateEntries);
        }

        for (const [index, item] of selectionFiles.entries()) {
          const directRow = directRows[index];
          if (directRow.status !== "raw_missing") {
            nextRows.push(directRow);
            continue;
          }
          try {
            const normalizedDateTime = await readExifDateTime(await item.handle.getFile());
            nextRows.push(matchSelectionDateTimeToRaw(item.name, normalizedDateTime, rawDateTimeIndex));
          } catch (selectionError) {
            nextRows.push({
              selectionName: item.name,
              status: "error",
              normalizedDateTime: null,
              message: `EXIF 분석 실패: ${errorMessage(selectionError)}`,
            });
          }
        }
      } else {
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
      }
      const safeRows = markDuplicateRawMatches(nextRows);
      setRows(safeRows);

      const successfulRows = safeRows.filter((row) => row.status === "success");
      if (successfulRows.length === 0) throw new Error("처리할 수 있는 RAW 매칭 결과가 없습니다.");
      const selectedRaw = await getDirectoryIfExists(rawDir, SELECTED_RAW_DIRECTORY);
      const finishedRaw = await getDirectoryIfExists(rawDir, FINISHED_RAW_DIRECTORY);
      const finishedRawFiles = finishedRaw ? await scanRawFiles(finishedRaw, 0) : [];
      const matchedRawNames = uniqueRawNames(successfulRows.flatMap(rawNamesOf));
      const output = planMetadataRawOutput({
        rawNames: matchedRawNames,
        excludeCompleted,
        transferMode,
        finishedRawNames: finishedRawFiles.map((file) => file.name),
      });
      const alreadyFinishedKeys = new Set(output.alreadyFinishedNames.map(normalizedLeafKey));
      const plannedRows = safeRows.map((row): MetadataSelectRow => {
        if (row.status !== "success") return row;
        const rowRawNames = rawNamesOf(row);
        const alreadyFinishedForRow = rowRawNames.filter((name) => alreadyFinishedKeys.has(normalizedLeafKey(name)));
        if (alreadyFinishedForRow.length === 0) return row;
        if (alreadyFinishedForRow.length === rowRawNames.length) {
          return { ...row, status: "already_finished", message: `${FINISHED_RAW_DIRECTORY}에 있어 작업 대상에서 제외했습니다.` };
        }
        return {
          ...row,
          message: `${row.message} · ${FINISHED_RAW_DIRECTORY}에 있는 ${alreadyFinishedForRow.length}장은 제외합니다.`,
        };
      });

      const rawCopyTransfers = output.copyFromRawNames.map((name) => {
        const file = findScannedFile(rawFiles, name);
        if (!file) throw new Error(`${name}: RAW 원본 파일 핸들을 찾지 못했습니다.`);
        return toTransfer(file);
      });
      const rawMoveTransfers = output.moveFromRawNames.map((name) => {
        const file = findScannedFile(rawFiles, name);
        if (!file) throw new Error(`${name}: RAW 작업본 파일 핸들을 찾지 못했습니다.`);
        return toTransfer(file);
      });
      const destination = output.destinationDirectory === SELECTED_RAW_DIRECTORY ? selectedRaw : finishedRaw;
      await assertNoDestinationCollisions(destination, [...rawCopyTransfers, ...rawMoveTransfers]);

      setRows(plannedRows);
      setPlan({
        rows: plannedRows,
        selectionCount: selectionFiles.length,
        rawCopyTransfers,
        rawMoveTransfers,
        destinationDirectory: output.destinationDirectory,
        alreadyFinishedCount: output.alreadyFinishedNames.length,
        matchedRawCount: matchedRawNames.length,
        burstExtraCount: Math.max(0, matchedRawNames.length - selectionFiles.length),
        skippedCount: plannedRows.filter((row) => row.status !== "success" && row.status !== "already_finished").length,
        excludeCompleted,
        transferMode,
      });
      setPhaseDetail("");
      setPhase("awaiting_confirmation");
    } catch (analysisError) {
      setError(errorMessage(analysisError));
      setPhaseDetail("");
      setPhase("failed");
    }
  }

  async function executeMatch() {
    if (!rawDir || !plan) return;
    setError("");
    let destination: FileSystemDirectoryHandle | null = null;
    let rawCreatedNames: string[] = [];
    try {
      setPhase(plan.rawMoveTransfers.length > 0 ? "moving_finished_raw" : "copying_raw");
      if (plan.rawCopyTransfers.length > 0 || plan.rawMoveTransfers.length > 0) {
        destination = await (rawDir as any).getDirectoryHandle(plan.destinationDirectory, { create: true }) as FileSystemDirectoryHandle;
      }
      if (destination && plan.rawCopyTransfers.length > 0) {
        const rawResult = await transferFilesSafely({
          transfers: plan.rawCopyTransfers,
          destination,
          deleteSources: false,
          onProgress: (current, total, name) => setPhaseDetail(`${current} / ${total} · ${name}`),
        });
        rawCreatedNames = rawResult.createdNames;
      }

      if (destination && plan.rawMoveTransfers.length > 0) {
        setPhase("moving_finished_raw");
        await transferFilesSafely({
          transfers: plan.rawMoveTransfers,
          destination,
          deleteSources: true,
          onProgress: (current, total, name) => setPhaseDetail(`${current} / ${total} · ${name}`),
        });
      }

      setRows(plan.rows);
      setPlan(null);
      const transferCount = plan.rawCopyTransfers.length + plan.rawMoveTransfers.length;
      setPhaseDetail(`RAW ${transferCount}장 ${plan.rawCopyTransfers.length > 0 ? "복사 완료" : "이동 완료"}`);
      setPhase("done");
    } catch (executionError) {
      const cleanupFailures = destination && rawCreatedNames.length > 0
        ? await removeTransferredCopies(destination, rawCreatedNames)
        : [];
      const base = errorMessage(executionError);
      setError(cleanupFailures.length > 0 ? `${base}\nRAW 복사본 정리 실패: ${cleanupFailures.join(", ")}` : base);
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
                <small style={{ display: "block", marginTop: 4, color: C.muted, lineHeight: 1.5 }}>선택한 RAW 작업본에서 매칭된 파일을 {FINISHED_RAW_DIRECTORY}/로 옮깁니다.</small>
              </span>
              <input type="checkbox" checked={excludeCompleted} disabled={running} onChange={(event) => toggleExclude(event.target.checked)} aria-label="이미 작업한 사진 제외" style={{ width: 20, height: 20, accentColor: C.orange }} />
            </label>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: `1px solid ${C.border}`, color: C.ink }}>
              <span>
                <strong style={{ display: "block", fontSize: 13 }}>처리 방식</strong>
                <small style={{ display: "block", marginTop: 4, color: C.muted, lineHeight: 1.5 }}>
                  {excludeCompleted
                    ? `완료 RAW로 이동 · ${FINISHED_RAW_DIRECTORY}/`
                    : transferMode === "copy"
                      ? `RAW 원본 유지 · ${SELECTED_RAW_DIRECTORY}/에 복사`
                      : `복사와 크기 검증 뒤 원본 RAW에서 제거 · ${SELECTED_RAW_DIRECTORY}/로 이동`}
                </small>
              </span>
              {excludeCompleted ? (
                <strong style={{ fontSize: 12, color: C.teal, whiteSpace: "nowrap" }}>완료 RAW로 이동</strong>
              ) : (
                <div role="radiogroup" aria-label="RAW 처리 방식" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {(["copy", "move"] as const).map((mode) => {
                    const active = transferMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={running}
                        onClick={() => changeTransferMode(mode)}
                        style={{
                          minHeight: 34,
                          padding: "6px 11px",
                          borderRadius: R.sm,
                          border: `1px solid ${active ? C.teal : C.border}`,
                          background: active ? C.teal : C.white,
                          color: active ? C.white : C.muted,
                          fontFamily: "inherit",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: running ? "not-allowed" : "pointer",
                        }}
                      >
                        {mode === "copy" ? "복사" : "이동"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <FolderPickerRow step={1} label="선택본" dir={selectionDir} disabled={running} onPick={() => pick(setSelectionDir, "read")} />
            <FolderPickerRow
              step={2}
              label="원본 JPG"
              hint="선택 사항 · 선택본 파일명이 바뀐 경우에만 지정"
              dir={sourceDir}
              disabled={running}
              onPick={() => pick(setSourceDir, "read")}
              onClear={() => { setSourceDir(null); resetAnalysis(); }}
            />
            <FolderPickerRow step={3} label={excludeCompleted ? "RAW 작업본" : "RAW 원본"} dir={rawDir} disabled={running} onPick={() => pick(setRawDir, "readwrite")} />

            <div style={{ marginTop: 16, display: "grid", gap: 6 }} aria-live="polite">
              {missingRequirements.map((message) => <div key={message} style={{ fontSize: 11, color: C.orange }}>• {message}</div>)}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
              <Btn onClick={analyze} disabled={!canAnalyze} style={canAnalyze ? { background: C.orange } : undefined}>
                {phase === "analyzing" ? PHASE_LABEL[phase] : "메타데이터 매칭 분석"}
              </Btn>
            </div>

            {running ? <div style={{ marginTop: 12, fontSize: 12, color: C.teal, textAlign: "center" }}>{PHASE_LABEL[phase]}{phaseDetail ? ` · ${phaseDetail}` : ""}</div> : null}
            {phase === "done" && phaseDetail ? <div style={{ marginTop: 12, fontSize: 12, color: C.success, textAlign: "center", fontWeight: 700 }}>{phaseDetail}</div> : null}
            {error ? <div style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12, color: C.danger, textAlign: "center", lineHeight: 1.7 }}>{error}</div> : null}

            {phase === "awaiting_confirmation" && plan ? (
              <div style={{ marginTop: 18, border: `1px solid ${C.border}`, borderRadius: R.md, background: C.light, padding: 16, color: C.ink }}>
                <strong style={{ display: "block", fontSize: 14 }}>파일을 변경하기 전에 확인해주세요.</strong>
                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.9, color: C.muted }}>
                  선택본 {plan.selectionCount}장
                  <br />매칭 RAW {plan.matchedRawCount}장
                  {plan.burstExtraCount > 0 ? <> · 동일 촬영시간 추가 RAW {plan.burstExtraCount}장</> : null}
                  {plan.rawCopyTransfers.length > 0 ? <><br />RAW 원본 유지 · {SELECTED_RAW_DIRECTORY}에 {plan.rawCopyTransfers.length}장 복사</> : null}
                  {plan.rawMoveTransfers.length > 0 ? <><br />원본에서 {plan.rawMoveTransfers.length}장 이동</> : null}
                  {plan.alreadyFinishedCount > 0 ? <> · 이미 완료되어 제외 {plan.alreadyFinishedCount}장</> : null}
                  {plan.skippedCount > 0 ? <><br /><strong style={{ color: C.orange }}>매칭 실패 {plan.skippedCount}장은 변경하지 않고 건너뜁니다.</strong></> : null}
                  <br />처리 방식: {plan.excludeCompleted ? "완료 RAW로 이동" : plan.transferMode === "copy" ? "복사" : "이동"}
                  <br />대상: {plan.destinationDirectory}/
                  {!plan.excludeCompleted && plan.transferMode === "move" ? <><br />이동은 {SELECTED_RAW_DIRECTORY} 복사를 검증한 뒤 원본 RAW에서 제거합니다.</> : null}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn onClick={executeMatch} style={{ background: C.orange }}>
                    {plan.rawCopyTransfers.length > 0
                      ? `RAW ${plan.rawCopyTransfers.length}장 복사`
                      : `RAW ${plan.rawMoveTransfers.length}장 이동`}
                  </Btn>
                  <Btn onClick={resetAnalysis} style={{ background: C.white, color: C.muted, border: `1px solid ${C.border}` }}>취소</Btn>
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 16, background: C.light, borderRadius: R.sm, padding: "12px 14px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
              <Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />원본 JPG가 없어도 파일명을 먼저 비교하고, 이름이 바뀐 선택본은 EXIF 촬영시간으로 RAW를 직접 찾습니다. 같은 촬영시간의 RAW는 연사 그룹으로 모두 선택합니다. 완료 제외 모드는 매칭된 RAW 작업본을 이동하며, 일반 모드에서는 복사 또는 안전 이동을 고를 수 있습니다.
            </div>
          </section>
        )}

        {rows.length > 0 ? (
          <section className="pc-card pc-card--padded" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 18, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>총 선택본</span> <strong>{rows.length}</strong></div>
              {plan ? <div><span style={{ color: C.muted }}>매칭 RAW</span> <strong style={{ color: C.teal }}>{plan.matchedRawCount}</strong></div> : null}
              {plan?.burstExtraCount ? <div><span style={{ color: C.muted }}>동일 촬영시간 추가 RAW</span> <strong style={{ color: C.teal }}>{plan.burstExtraCount}</strong></div> : null}
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
                        <div style={{ color: C.muted, marginTop: 2, lineHeight: 1.7 }}>
                          <div>{row.message}</div>
                          {row.matchedOriginalNames?.length ? <div>원본 JPG {row.matchedOriginalNames.length}장</div> : row.matchedOriginalName ? <div>원본 JPG · {leafName(row.matchedOriginalName)}</div> : null}
                          {rawNamesOf(row).map((rawName) => <div key={rawName}>→ {leafName(rawName)}</div>)}
                          {rawNamesOf(row).length > 1 ? <span style={{ display: "inline-block", marginTop: 2, padding: "1px 6px", borderRadius: 999, background: "rgba(21,88,85,.10)", color: C.teal, fontSize: 10, fontWeight: 800 }}>연사 {rawNamesOf(row).length}장</span> : null}
                        </div>
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
