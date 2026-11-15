"use client";

import { useCallback, useEffect, useState } from "react";

import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { readApiResponse } from "@/lib/http/apiResponse";
import type { ColorMatchPublicResult, ColorMatchTargetMode } from "@/lib/photo-edit/manifest";

type ColorMatchApiResult = {
  job?: { id?: string; status?: string } | null;
  colorMatch?: ColorMatchPublicResult | null;
};

export function usePersonSelectColorMatchController({
  eventId,
  path,
  setPath,
  setMessage,
}: {
  eventId: string;
  path: string;
  setPath: (value: string) => void;
  setMessage: (message: string) => void;
}) {
  const [brightness, setBrightness] = useState(true);
  const [skinTone, setSkinTone] = useState(true);
  const [targetMode, setTargetMode] = useState<ColorMatchTargetMode>("median");
  const [referenceFile, setReferenceFile] = useState("");
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<ColorMatchPublicResult | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  const loadResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/person-select/${eventId}/color-match`, { cache: "no-store" });
      const body = await readApiResponse<ColorMatchApiResult>(response, "색 맞춤 결과");
      setResult(body.colorMatch ?? null);
      if (body.job && ["QUEUED", "RUNNING"].includes(String(body.job.status ?? ""))) setJobId(body.job.id ?? "");
      return body.colorMatch ?? null;
    } catch {
      return null;
    }
  }, [eventId]);

  useEffect(() => { void loadResult(); }, [loadResult]);

  useRemoteJobPoller({
    jobId,
    label: "색 맞춤 상태",
    onTerminal: async (job) => {
      const nextStatus = resolveRemoteJobResult(job, "색 맞춤에 실패했습니다.");
      setStatus(nextStatus);
      if (job.status === "COMPLETED") {
        const nextResult = await loadResult();
        if (nextResult?.outputVirtualPath) {
          setPath(nextResult.outputVirtualPath);
          setMessage("");
        }
      } else {
        setMessage(`색 맞춤 실패: ${String(nextStatus.error ?? job.error ?? "작업 결과를 확인해 주세요.")}`);
      }
      setJobId("");
    },
  });

  const start = useCallback(async () => {
    // After a successful run the upload path is switched to the output folder.
    // Only translate that exact path back to its source when the user asks to run
    // the match again. A newly selected folder must never reuse the previous job.
    const sourcePath = result && path === result.outputVirtualPath
      ? result.sourceVirtualPath
      : path;
    if (!sourcePath) { setMessage("보정본 폴더를 먼저 선택하세요."); return; }
    if (!brightness && !skinTone) { setMessage("밝기 또는 얼굴·바디 톤 중 하나를 선택해 주세요."); return; }
    if (targetMode === "reference" && !referenceFile.trim()) { setMessage("기준 사진 파일명을 입력해 주세요."); return; }
    setMessage("");
    setStatus({ message: "사진의 실제 픽셀을 측정하고 있어요." });
    try {
      const response = await fetch(`/api/person-select/${eventId}/color-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath, brightness, skinTone, targetMode, referenceFile: referenceFile.trim() || undefined }),
      });
      const body = await readApiResponse<ColorMatchApiResult>(response, "색 맞춤 시작");
      setJobId(body.job?.id ?? "");
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "색 맞춤을 시작하지 못했습니다." });
      setMessage(error instanceof Error ? error.message : "색 맞춤을 시작하지 못했습니다.");
    }
  }, [brightness, eventId, path, referenceFile, result, setMessage, skinTone, targetMode]);

  return {
    brightness,
    setBrightness,
    skinTone,
    setSkinTone,
    targetMode,
    setTargetMode,
    referenceFile,
    setReferenceFile,
    colorMatchJobId: jobId,
    colorMatchResult: result,
    colorMatchStatus: status,
    startColorMatch: start,
    refreshColorMatch: loadResult,
  };
}
