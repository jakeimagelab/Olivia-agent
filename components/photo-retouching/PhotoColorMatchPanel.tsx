"use client";
/* eslint-disable @next/next/no-img-element -- Signed private previews cannot use the public image optimizer. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, FolderOpen, LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";

import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { useRemoteJobPoller, type RemoteJobPollResult } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import { readApiResponse } from "@/lib/http/apiResponse";
import type { ColorMatchPublicResult } from "@/lib/photo-edit/manifest";
import { consumePhotoRetouchHandoff, storePhotoRetouchReturn } from "@/lib/photo-retouch/handoff";
import styles from "./PhotoColorMatchPanel.module.css";

type RecentResult = {
  id: string;
  sourcePath: string;
  outputPath: string;
  summary: { total?: number; pass?: number; check?: number; review?: number } | null;
  createdAt: string;
  completedAt: string | null;
};

type MatchApiResponse = {
  job?: { id?: string; status?: string; result?: Record<string, unknown> | null } | null;
  colorMatch?: ColorMatchPublicResult | null;
  recent?: RecentResult[];
};

function relativeTime(value: string | null | undefined) {
  if (!value) return "방금";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(minutes, "minute");
  return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(Math.round(minutes / 60), "hour");
}

export function PhotoColorMatchPanel({
  initialPath = "",
  initialHandoffId = "",
  initialReturnPath = "",
  onOpenEditor,
}: {
  initialPath?: string;
  initialHandoffId?: string;
  initialReturnPath?: string;
  onOpenEditor: (outputPath: string) => void;
}) {
  const { workerPresence } = usePhotoStudioExecution();
  const [sourcePath, setSourcePath] = useState(initialPath);
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [returnPath, setReturnPath] = useState(initialReturnPath);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brightness, setBrightness] = useState(true);
  const [skinTone, setSkinTone] = useState(true);
  const [targetMode, setTargetMode] = useState<"median" | "reference">("median");
  const [referenceFile, setReferenceFile] = useState("");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ColorMatchPublicResult | null>(null);
  const [recent, setRecent] = useState<RecentResult[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const response = await fetch("/api/photo-retouch/color-match?recent=1", { cache: "no-store" });
      const body = await readApiResponse<MatchApiResponse>(response, "최근 색 맞춤");
      setRecent(Array.isArray(body.recent) ? body.recent : []);
    } catch {
      // Recent history is optional; the primary match flow remains available.
    }
  }, []);

  const loadResult = useCallback(async (outputPath?: string) => {
    const query = outputPath ? `?output_path=${encodeURIComponent(outputPath)}` : "";
    const response = await fetch(`/api/photo-retouch/color-match${query}`, { cache: "no-store" });
    const body = await readApiResponse<MatchApiResponse>(response, "색 맞춤 결과");
    setResult(body.colorMatch ?? null);
    if (body.colorMatch?.sourceVirtualPath) setSourcePath(body.colorMatch.sourceVirtualPath);
    return body.colorMatch ?? null;
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!initialHandoffId || typeof window === "undefined") return;
    const handoff = consumePhotoRetouchHandoff(window.sessionStorage, initialHandoffId);
    if (!handoff) {
      setError("브릿지에서 넘긴 폴더 정보가 만료됐어요. 브릿지에서 사진 보정을 다시 눌러주세요.");
      return;
    }
    setSourcePath(handoff.sourcePath);
    setSelectedFileNames(handoff.selectedFileNames);
    if (handoff.returnPath) setReturnPath(handoff.returnPath);
  }, [initialHandoffId]);

  const finishJob = useCallback(async (job: RemoteJobPollResult) => {
    setJobId("");
    if (job.status !== "COMPLETED") {
      setError(job.error || job.message || "색 맞춤에 실패했습니다.");
      setStatus("");
      return;
    }
    const outputPath = typeof job.result?.outputVirtualPath === "string" ? job.result.outputVirtualPath : undefined;
    try {
      const next = await loadResult(outputPath);
      setStatus(next ? `색 맞춤 ${next.summary.total.toLocaleString()}장이 끝났어요.` : "색 맞춤이 끝났어요.");
      await loadRecent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "완료된 결과를 읽지 못했습니다.");
    }
  }, [loadRecent, loadResult]);

  useRemoteJobPoller({ jobId, label: "색 맞춤", onTerminal: finishJob });

  const disabledReason = !sourcePath
    ? "보정본 폴더를 먼저 선택하세요."
    : workerPresence.online !== true
      ? "Mac Studio가 꺼져 있어요."
      : !brightness && !skinTone
        ? "밝기 또는 얼굴·바디 톤 중 하나를 선택하세요."
        : targetMode === "reference" && !referenceFile.trim()
          ? "기준 사진 파일명을 입력하세요."
          : "";

  const start = useCallback(async () => {
    if (disabledReason || jobId) return;
    setError("");
    setStatus("폴더를 확인하고 색을 측정하고 있어요.");
    try {
      const response = await fetch("/api/photo-retouch/color-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath,
          options: { brightness, skin_tone: skinTone },
          reference: { mode: targetMode, ...(targetMode === "reference" ? { file: referenceFile.trim() } : {}) },
          selectedFileNames,
        }),
      });
      const body = await readApiResponse<MatchApiResponse>(response, "색 맞춤");
      const id = body.job?.id;
      if (!id) throw new Error("색 맞춤 작업 번호를 받지 못했습니다.");
      setJobId(id);
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "색 맞춤을 시작하지 못했습니다.");
    }
  }, [brightness, disabledReason, jobId, referenceFile, selectedFileNames, skinTone, sourcePath, targetMode]);

  const returnHref = useMemo(() => {
    if (!returnPath || !result?.outputVirtualPath || typeof window === "undefined") return "";
    const id = storePhotoRetouchReturn(window.sessionStorage, { outputPath: result.outputVirtualPath, returnPath });
    const separator = returnPath.includes("?") ? "&" : "?";
    return `${returnPath}${separator}retouch=${encodeURIComponent(id)}`;
  }, [result?.outputVirtualPath, returnPath]);

  return <div className={styles.shell}>
    <section className={styles.card}>
      <div className={styles.heading}>
        <div><h2>보정본 색 맞춤</h2><p>원본 보정본은 읽기만 하고, 결과는 옆의 새 폴더에 만듭니다.</p></div>
        <button type="button" className={styles.secondary} onClick={() => setPickerOpen(true)} disabled={Boolean(jobId)}><FolderOpen size={15} />폴더 선택</button>
      </div>

      <div className={styles.folderBox}>
        <strong>Mac Studio 폴더</strong>
        <div className={styles.path}>{sourcePath || "선택된 폴더가 없습니다."}</div>
        {selectedFileNames.length ? <div className={styles.selectionNote}>브릿지에서 고른 {selectedFileNames.length.toLocaleString()}장만 처리합니다.</div> : null}
      </div>

      <div className={styles.controls}>
        <div className={styles.checks}>
          <label><input type="checkbox" checked={brightness} onChange={(event) => setBrightness(event.target.checked)} />밝기 맞추기</label>
          <label><input type="checkbox" checked={skinTone} onChange={(event) => setSkinTone(event.target.checked)} />얼굴·바디 톤 맞추기</label>
        </div>
        <div className={styles.segment} aria-label="색 맞춤 기준">
          <button type="button" className={targetMode === "median" ? styles.active : ""} onClick={() => setTargetMode("median")}>전체 중앙값</button>
          <button type="button" className={targetMode === "reference" ? styles.active : ""} onClick={() => setTargetMode("reference")}>기준 사진 1장</button>
        </div>
        {targetMode === "reference" ? <input className={styles.input} value={referenceFile} onChange={(event) => setReferenceFile(event.target.value)} placeholder="기준 사진 파일명 (예: IMG_1024.JPG)" /> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void start()} disabled={Boolean(disabledReason) || Boolean(jobId)}>
            {jobId ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{jobId ? "색 맞춤 중" : "색 맞춤"}
          </button>
        </div>
        {disabledReason ? <p className={styles.disabledReason}>{disabledReason}</p> : null}
      </div>

      {status ? <div className={styles.status}>{status}</div> : null}
      {error ? <div className={styles.error}><CircleAlert size={15} /> {error}</div> : null}

      {result ? <div>
        <div className={styles.resultHeading}>
          <div><h2>결과 확인</h2><p>{result.outputVirtualPath}</p></div>
          <Check size={19} color="#197260" />
        </div>
        <div className={styles.success}>결과 폴더로 자동 저장했습니다.{result.files.some((file) => file.convertedToSrgb) ? " · sRGB로 변환함" : ""}</div>
        <div className={styles.summary}>
          <span>{result.summary.total}장</span><span>통과 {result.summary.pass}</span><span>확인 {result.summary.check}</span><span>다시 보기 {result.summary.review}</span>
        </div>
        <div className={styles.previewRows}>
          {result.files.map((file) => <button type="button" className={styles.previewRow} key={file.relativePath} onClick={() => onOpenEditor(result.outputVirtualPath)}>
            <div className={styles.previewCell}><span>{file.fileName} · 원본</span><div className={styles.previewCanvas}>{file.sourcePreviewUrl ? <img src={file.sourcePreviewUrl} alt={`${file.fileName} 원본`} /> : null}</div><div className={styles.delta}>차이 {file.deltaBefore?.toFixed(1) ?? "—"}</div></div>
            <div className={styles.previewCell}><span>{file.fileName} · 색 맞춤</span><div className={styles.previewCanvas}>{file.resultPreviewUrl ? <img src={file.resultPreviewUrl} alt={`${file.fileName} 색 맞춤`} /> : null}</div><div className={styles.delta}>차이 {file.deltaAfter?.toFixed(1) ?? "—"}</div></div>
          </button>)}
        </div>
        <div className={styles.actions} style={{ marginTop: 16 }}>
          <button type="button" className={styles.secondary} onClick={() => onOpenEditor(result.outputVirtualPath)}><SlidersHorizontal size={15} />수동 편집</button>
          {returnHref ? <a className={styles.weak} href={returnHref}>셀렉으로 돌아가 올리기<ArrowRight size={15} /></a> : null}
        </div>
      </div> : null}
    </section>

    <aside className={styles.card}>
      <div className={styles.recentHeading}><h2>최근 작업</h2><button type="button" className={styles.weak} onClick={() => void loadRecent()}>새로고침</button></div>
      <p className={styles.muted}>최근 색 맞춤 결과 폴더 10개를 바로 열 수 있습니다.</p>
      <div className={styles.recentList}>
        {recent.length ? recent.map((item) => <button key={item.id} type="button" className={styles.recentItem} onClick={() => void loadResult(item.outputPath)}>
          <span><strong>{item.outputPath.split("/").filter(Boolean).at(-1) || item.outputPath}</strong><small>{item.sourcePath}</small></span>
          <em>{Number(item.summary?.total ?? 0)}장 · 통과 {Number(item.summary?.pass ?? 0)} · {relativeTime(item.completedAt || item.createdAt)}</em>
        </button>) : <div className={styles.status}>아직 색 맞춤 작업이 없습니다.</div>}
      </div>
    </aside>

    {pickerOpen ? <PhotoSourcePicker sourceScope="person-select" rootLabel="보정본 폴더" onCancel={() => setPickerOpen(false)} onSelectRemote={(selection) => {
      setSourcePath(selection.path);
      setSelectedFileNames([]);
      setResult(null);
      setError("");
      setPickerOpen(false);
    }} /> : null}
  </div>;
}
