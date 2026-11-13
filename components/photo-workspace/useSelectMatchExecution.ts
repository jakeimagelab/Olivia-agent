"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { ApprovedCaptureMatch } from "@/components/photo-workspace/useSelectMatchPreflight";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import type { CaptureMatchPreflight } from "@/lib/selectMatch/captureMatch";
import { formatCaptureTime } from "@/lib/selectMatch/captureTime";
import {
  remoteRawMatchUnavailableReason,
  runRemoteRawMatchCopy,
  type RemoteRawMatchCopyPayload,
  type RemoteRawMatchJob,
} from "@/lib/selectMatch/remoteRawMatch";
import { relativeToDirectoryRoot } from "@/lib/selectMatch/workspaceHelpers";

const RAW_MATCH_JOB_ID = "raw-match";

type SelectMatchStep = "idle" | "loading" | "ready" | "preflight" | "matching" | "done" | "client_input" | "raw_pick" | "selection_done";

export type RawMatchResult = {
  matched: number;
  alreadyCopied: number;
  missing: number;
  selected: number;
  jpgMoved: number;
  xmpMoved: number;
  failed: number;
  deliveredFolderName: string;
  missingNames: string[];
  failedNames: string[];
  moveNotice: string;
  cancelled: boolean;
  attributePassed: number;
  attributeFailed: number;
};

const EMPTY_RESULT: RawMatchResult = {
  matched: 0,
  alreadyCopied: 0,
  missing: 0,
  selected: 0,
  jpgMoved: 0,
  xmpMoved: 0,
  failed: 0,
  deliveredFolderName: "",
  missingNames: [],
  failedNames: [],
  moveNotice: "",
  cancelled: false,
  attributePassed: 0,
  attributeFailed: 0,
};

export function useSelectMatchExecution({
  setStep,
  rootDir,
  rawRootDir,
  jpgScanRootName,
  preflight,
  approvedMatches,
  preflightTargetCountMatches,
  workerOnline,
  workerRawRootPath,
  workerJpgRootPath,
  moveMatchedJpgs,
  deliveredFolderName,
}: {
  setStep: Dispatch<SetStateAction<SelectMatchStep>>;
  rootDir: FileSystemDirectoryHandle | null;
  rawRootDir: FileSystemDirectoryHandle | null;
  jpgScanRootName: string;
  preflight: CaptureMatchPreflight | null;
  approvedMatches: readonly ApprovedCaptureMatch[];
  preflightTargetCountMatches: boolean;
  workerOnline: boolean | null;
  workerRawRootPath: string;
  workerJpgRootPath: string;
  moveMatchedJpgs: boolean;
  deliveredFolderName: string;
}) {
  const [rawSelectMode, setRawSelectMode] = useState<"move" | "copy">("copy");
  const [progress, setProgressState] = useState({ cur: 0, total: 0, msg: "" });
  const [rawOutputPath, setRawOutputPath] = useState("");
  const [rawOutputOpenError, setRawOutputOpenError] = useState("");
  const [result, setResult] = useState<RawMatchResult>(EMPTY_RESULT);
  const [remoteExecutionError, setRemoteExecutionError] = useState("");
  const cancelRef = useRef(false);
  const remoteRawMatchJobIdRef = useRef("");

  const setProgress = useCallback((next: { cur: number; total: number; msg: string }) => {
    setProgressState(next);
    useBackgroundJobsStore.getState().updateJob(RAW_MATCH_JOB_ID, next);
  }, []);

  const runMatch = useCallback(async () => {
    if ((!rootDir && !rawRootDir) || !preflight || !approvedMatches.length || !preflightTargetCountMatches) return;
    const unavailableReason = remoteRawMatchUnavailableReason(workerOnline);
    if (unavailableReason) {
      setRemoteExecutionError(unavailableReason);
      return;
    }
    if (!workerRawRootPath.trim() || (moveMatchedJpgs && !workerJpgRootPath.trim())) {
      setRemoteExecutionError("Mac Studio에서 보이는 RAW/JPG 폴더 경로를 확인해 주세요.");
      return;
    }
    setStep("matching");
    cancelRef.current = false;
    setRemoteExecutionError("");
    setRawOutputPath("");
    setRawOutputOpenError("");
    useBackgroundJobsStore.getState().startJob({
      id: RAW_MATCH_JOB_ID,
      label: `RAW ${rawSelectMode === "move" ? "이동" : "복사"} 중`,
      cur: 0,
      total: approvedMatches.length,
      status: "running",
      returnPath: "/photo-sorting?mode=raw-match",
      cancelRef,
    });
    setProgress({
      cur: 0,
      total: approvedMatches.length,
      msg: "Mac Studio 워커에 속성 보존 작업을 전달하고 있습니다.",
    });

    const missingNames = preflight.items
      .filter((item) => !approvedMatches.some((approved) => approved.item.id === item.id))
      .map((item) => `${item.jpg.name} — ${item.status === "time_mismatch" ? "촬영시각 불일치" : item.status === "multiple_candidates" ? "후보 여러 개" : item.status === "missing_time" ? "촬영시각 없음" : "RAW 없음"}`);
    const approvedById = new Map(approvedMatches.map((match) => [match.item.id, match]));
    const payload: RemoteRawMatchCopyPayload = {
      rawRootPath: workerRawRootPath.trim(),
      ...(moveMatchedJpgs ? { jpgRootPath: workerJpgRootPath.trim() } : {}),
      items: await Promise.all(approvedMatches.map(async ({ item, candidate }) => {
        const jpgFile = moveMatchedJpgs ? await item.jpg.handle.getFile() : null;
        return {
          rawPath: relativeToDirectoryRoot(candidate.entry.relativePath, rawRootDir?.name ?? rootDir?.name ?? ""),
          destDir: "Selected_RAW",
          rawAction: rawSelectMode,
          rawExpectedSize: candidate.fileSize,
          rawExpectedCaptureTimeMs: candidate.captureTime?.timestampMs ?? null,
          ...(moveMatchedJpgs && jpgFile ? {
            jpgPath: relativeToDirectoryRoot(item.jpg.relativePath, jpgScanRootName),
            jpgDestDir: deliveredFolderName.trim(),
            jpgExpectedSize: jpgFile.size,
            jpgExpectedCaptureTimeMs: item.jpgCaptureTime?.timestampMs ?? null,
          } : {}),
        };
      })),
      logRows: preflight.items.map((item) => {
        const approved = approvedById.get(item.id);
        return {
          jpgName: item.jpg.name,
          jpgPath: item.jpg.relativePath,
          jpgCaptureTime: formatCaptureTime(item.jpgCaptureTime),
          rawPath: approved
            ? relativeToDirectoryRoot(approved.candidate.entry.relativePath, rawRootDir?.name ?? rootDir?.name ?? "")
            : item.candidates.map((candidate) => candidate.entry.relativePath).join(" | "),
          rawCaptureTime: approved
            ? formatCaptureTime(approved.candidate.captureTime)
            : item.candidates.map((candidate) => formatCaptureTime(candidate.captureTime)).join(" | ") || "촬영시각 없음",
          result: approved ? approved.manual ? "수동선택" : "확정" : "건너뜀",
        };
      }),
      openOutput: true,
    };

    try {
      const remoteResult = await runRemoteRawMatchCopy(payload, {
        workerOnline,
        onJob: (job: RemoteRawMatchJob) => {
          remoteRawMatchJobIdRef.current = job.id;
          if (!job.progress) return;
          setProgress({
            cur: job.progress.current,
            total: job.progress.total || approvedMatches.length,
            msg: job.progress.message,
          });
        },
      });
      setRawOutputPath(remoteResult.outputDir);
      setProgress({ cur: approvedMatches.length, total: approvedMatches.length, msg: "RAW 매칭 완료" });
      setResult({
        matched: remoteResult.copied + remoteResult.rawMoved + remoteResult.alreadyCopied,
        alreadyCopied: remoteResult.alreadyCopied,
        missing: missingNames.length,
        selected: preflight.items.length,
        jpgMoved: remoteResult.jpgMoved,
        xmpMoved: remoteResult.xmpMoved,
        failed: remoteResult.failed,
        deliveredFolderName: remoteResult.jpgMoved > 0 ? deliveredFolderName.trim() : "",
        missingNames,
        failedNames: remoteResult.failures.map((failure) => `${failure.stage} · ${failure.path} — ${failure.error}`),
        moveNotice: remoteResult.attributeFailed > 0
          ? "일부 파일의 원본 속성 확인이 실패해 해당 단계는 완료 처리하지 않았습니다."
          : remoteResult.warnings.length > 0
            ? `허용 가능한 속성 차이 ${remoteResult.warnings.length}건을 경고로 기록했습니다.`
            : "",
        cancelled: cancelRef.current,
        attributePassed: remoteResult.attributePassed,
        attributeFailed: remoteResult.attributeFailed,
      });
      setStep("done");
      useBackgroundJobsStore.getState().finishJob(RAW_MATCH_JOB_ID, cancelRef.current ? "cancelled" : "done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mac Studio RAW 복사 작업에 실패했습니다.";
      useBackgroundJobsStore.getState().finishJob(RAW_MATCH_JOB_ID, cancelRef.current ? "cancelled" : "error");
      if (cancelRef.current) {
        setResult((current) => ({
          ...current,
          selected: preflight.items.length,
          missing: missingNames.length,
          cancelled: true,
          moveNotice: message,
        }));
        setStep("done");
      } else {
        setRemoteExecutionError(message);
        setStep("preflight");
      }
    } finally {
      remoteRawMatchJobIdRef.current = "";
    }
  }, [approvedMatches, deliveredFolderName, jpgScanRootName, moveMatchedJpgs, preflight, preflightTargetCountMatches, rawRootDir, rawSelectMode, rootDir, setProgress, setStep, workerJpgRootPath, workerOnline, workerRawRootPath]);

  const cancelRemoteRawMatch = useCallback(() => {
    cancelRef.current = true;
    const jobId = remoteRawMatchJobIdRef.current;
    if (!jobId) return;
    void fetch(`/api/remote-jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
  }, []);

  const openRawOutputFolder = useCallback(async () => {
    setRawOutputOpenError("");
    if (!rawOutputPath) {
      setRawOutputOpenError("Selected_RAW 폴더 위치를 확인할 수 없습니다.");
      return;
    }
    setRawOutputOpenError(`Mac Studio 결과 폴더: ${rawOutputPath}`);
  }, [rawOutputPath]);

  const resetOutputStatus = useCallback(() => {
    setRawOutputPath("");
    setRawOutputOpenError("");
  }, []);

  return {
    rawSelectMode,
    setRawSelectMode,
    progress,
    setProgress,
    rawOutputPath,
    rawOutputOpenError,
    result,
    remoteExecutionError,
    runMatch,
    cancelRemoteRawMatch,
    openRawOutputFolder,
    resetOutputStatus,
  };
}
