"use client";

import { AlertTriangle, CheckCircle2, Link2, LoaderCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { readJpgCaptureTime } from "@/lib/selectMatch/captureTime";
import { remoteRawMatchRunDisabledReason } from "@/lib/selectMatch/remoteRawMatch";
import type { RemoteBridgeRawMatchResult } from "@/lib/selectMatch/remoteBridgeRawMatchTypes";
import { C } from "@/lib/theme";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";

type Job = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  progress?: { current?: number; total?: number; message?: string } | null;
  result?: RemoteBridgeRawMatchResult | null;
  error?: string | null;
  message?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJob(value: unknown): Job {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string") {
    throw new Error("RAW 매칭 작업 상태를 읽지 못했습니다.");
  }
  return value as unknown as Job;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function remotePathParts(selection: RemoteNasSelection): string[] {
  return selection.path.split("/").map((part) => part.trim()).filter(Boolean);
}

export function buildRemoteBridgeRawMatchPayload(
  selection: RemoteNasSelection,
  selectedJpgs: readonly BridgeJpgFile[],
  options: { rawOnly?: boolean } = {},
) {
  const parts = remotePathParts(selection);
  const rawOnly = options.rawOnly === true;
  const projectIndex = parts.length > 1 && /^root-\d+$/iu.test(parts[0]) ? 1 : 0;
  const projectFolderName = (rawOnly ? parts.at(-1) : parts[projectIndex])?.normalize("NFC") ?? "";
  const currentJpgDirectory = rawOnly ? "" : parts.slice(projectIndex + 1).join("/");
  if (!projectFolderName || (!rawOnly && !currentJpgDirectory)) throw new Error("촬영 폴더와 JPG 하위 경로를 확인하지 못했습니다.");
  return {
    projectRoot: {
      projectKey: selection.path,
      folderName: projectFolderName,
      relativePath: rawOnly ? selection.path : projectFolderName,
      kind: "raw" as const,
    },
    ...(rawOnly ? {} : { currentJpgDirectory }),
    selectedJpgs: selectedJpgs.map((jpg) => ({
      name: jpg.name,
      relativePath: rawOnly
        ? jpg.relativePath || jpg.name
        : [currentJpgDirectory, jpg.relativePath || jpg.name].filter(Boolean).join("/"),
      size: jpg.size,
      captureTimeMs: jpg.timestampSource === "mtime" ? null : jpg.captureTimestamp ?? null,
    })),
    ...(rawOnly ? { moveJpgs: false } : { moveJpgs: true, deliveredFolderName: "1차보정본" }),
    openOutput: true,
  };
}

async function readLocalJpgCaptureMetadata(
  jpgs: readonly BridgeJpgFile[],
  onProgress: (completed: number, total: number) => void,
): Promise<BridgeJpgFile[]> {
  const output = new Array<BridgeJpgFile>(jpgs.length);
  let cursor = 0;
  let completed = 0;
  const concurrency = Math.min(8, Math.max(1, jpgs.length));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= jpgs.length) return;
      const jpg = jpgs[index];
      try {
        const file = jpg.file ?? await jpg.handle?.getFile();
        const captureTime = file ? await readJpgCaptureTime(file) : null;
        output[index] = {
          ...jpg,
          size: file?.size ?? jpg.size,
          captureTimestamp: captureTime?.timestampMs,
          timestampSource: captureTime ? "datetime_original" : "mtime",
        };
      } catch (error) {
        // 한 파일의 권한·메타데이터 오류가 나머지 셀렉 전체를 막으면 안 된다.
        // 촬영시각이 없는 항목은 워커가 "확인 필요"로 분리한다.
        console.error("[raw-match] Failed to read local JPG capture time", jpg.relativePath || jpg.name, error);
        output[index] = {
          ...jpg,
          captureTimestamp: undefined,
          timestampSource: "mtime",
        };
      }
      completed += 1;
      onProgress(completed, jpgs.length);
    }
  }));
  return output;
}

export default function RemoteBridgeRawMatchWorkspace({
  remoteSelection,
  selectedJpgs,
  rawOnly = false,
  dark = false,
  onChangeNasFolder,
  onUseLocalFolder,
}: {
  remoteSelection: RemoteNasSelection;
  selectedJpgs: readonly BridgeJpgFile[];
  rawOnly?: boolean;
  dark?: boolean;
  onChangeNasFolder?: () => void;
  onUseLocalFolder?: () => void;
}) {
  const { workerPresence } = usePhotoStudioExecution();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<{ completed: number; total: number } | null>(null);
  const disabledReason = remoteRawMatchRunDisabledReason(selectedJpgs.length, workerPresence.online);
  const payloadShapeValid = useMemo(() => {
    try {
      buildRemoteBridgeRawMatchPayload(remoteSelection, selectedJpgs, { rawOnly });
      return true;
    } catch {
      return false;
    }
  }, [rawOnly, remoteSelection, selectedJpgs]);
  const result = job?.status === "COMPLETED" ? job.result ?? null : null;
  const progressCurrent = job?.progress?.current ?? 0;
  const progressTotal = job?.progress?.total ?? selectedJpgs.length;
  const progressPercent = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;
  const textColor = dark ? "rgba(255,255,255,.88)" : C.txt;
  const mutedColor = dark ? "rgba(255,255,255,.52)" : C.muted;
  const borderColor = dark ? "rgba(255,255,255,.13)" : C.border;
  const cardColor = dark ? "rgba(255,255,255,.04)" : C.light;
  const insetColor = dark ? "rgba(0,0,0,.16)" : C.bg;
  const accentColor = dark ? "#4FD8B8" : C.teal;

  const run = useCallback(async () => {
    if (disabledReason || busy) return;
    if (!payloadShapeValid) {
      setError("촬영 폴더와 JPG 하위 경로를 확인하지 못했습니다.");
      return;
    }
    setBusy(true);
    setError("");
    setJob(null);
    try {
      const preparedJpgs = rawOnly
        ? await readLocalJpgCaptureMetadata(selectedJpgs, (completed, total) => setPreparing({ completed, total }))
        : selectedJpgs;
      setPreparing(null);
      const payload = buildRemoteBridgeRawMatchPayload(remoteSelection, preparedJpgs, { rawOnly });
      const createdResponse = await fetch("/api/remote-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PHOTO_BRIDGE_RAW_MATCH", payload }),
      });
      const createdBody: unknown = await createdResponse.json().catch(() => ({}));
      if (!createdResponse.ok || !isRecord(createdBody)) {
        throw new Error(isRecord(createdBody) && typeof createdBody.error === "string" ? createdBody.error : "RAW 매칭 작업을 만들지 못했습니다.");
      }
      let next = parseJob(createdBody.job);
      setJob(next);
      while (next.status === "QUEUED" || next.status === "RUNNING") {
        await wait(1_000);
        const response = await fetch(`/api/remote-jobs?id=${encodeURIComponent(next.id)}`, { cache: "no-store" });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isRecord(body)) throw new Error("RAW 매칭 작업 상태를 확인하지 못했습니다.");
        next = parseJob(body.job);
        setJob(next);
      }
      if (next.status !== "COMPLETED") throw new Error(next.error || next.message || "RAW 매칭 작업에 실패했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "RAW 매칭 작업에 실패했습니다.");
    } finally {
      setPreparing(null);
      setBusy(false);
    }
  }, [busy, disabledReason, payloadShapeValid, rawOnly, remoteSelection, selectedJpgs]);

  return (
    <section style={{ display: "grid", gap: 14, color: textColor, maxWidth: rawOnly ? 760 : undefined, margin: rawOnly ? "28px auto" : undefined, padding: rawOnly ? "0 24px" : undefined }}>
      <div style={{ border: `1px solid ${borderColor}`, borderRadius: 12, background: cardColor, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={18} color={accentColor} aria-hidden="true" />
          <div><strong style={{ fontSize: 15 }}>NAS RAW 매칭 실행</strong><p style={{ margin: "4px 0 0", color: mutedColor, fontSize: 12 }}>Mac Studio가 선택한 NAS 촬영 폴더에서 파일명·촬영시각을 확인합니다.</p></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
          <div style={{ borderRadius: 10, background: insetColor, padding: 14 }}><span style={{ display: "block", color: mutedColor, fontSize: 11 }}>확정 셀렉</span><b style={{ display: "block", marginTop: 4, color: dark ? accentColor : C.orange, fontSize: 22 }}>{selectedJpgs.length.toLocaleString("ko-KR")}장</b></div>
          <div style={{ borderRadius: 10, background: insetColor, padding: 14 }}><span style={{ display: "block", color: mutedColor, fontSize: 11 }}>NAS 촬영 폴더</span><b style={{ display: "block", marginTop: 6, fontSize: 13 }}>{remoteSelection.displayPath}</b></div>
        </div>
        {rawOnly ? <p style={{ margin: "12px 0 0", color: mutedColor, fontSize: 11 }}>RAW만 NAS의 Selected_RAW에 복사합니다. 로컬 JPG와 NAS JPG/XMP는 이동하지 않습니다.</p> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" disabled={Boolean(disabledReason) || busy} onClick={() => void run()} style={{ border: Boolean(disabledReason) || busy ? `1px solid ${borderColor}` : 0, borderRadius: 9, padding: "10px 18px", background: Boolean(disabledReason) || busy ? "transparent" : dark ? "#37C39D" : C.orange, color: Boolean(disabledReason) || busy ? mutedColor : dark ? "#103E36" : "white", fontWeight: 600, cursor: Boolean(disabledReason) || busy ? "not-allowed" : "pointer" }}>
            {busy ? preparing ? `촬영시각 확인 중 ${preparing.completed}/${preparing.total}` : "RAW 매칭 실행 중…" : `RAW 매칭 실행 (${selectedJpgs.length.toLocaleString("ko-KR")}장)`}
          </button>
          {disabledReason ? <span style={{ color: "#b4472a", fontSize: 12 }}>{disabledReason}</span> : null}
          {onChangeNasFolder ? <button type="button" disabled={busy} onClick={onChangeNasFolder} style={{ border: `1px solid ${borderColor}`, borderRadius: 9, padding: "9px 14px", background: "transparent", color: mutedColor, font: "inherit", fontSize: 12, cursor: busy ? "not-allowed" : "pointer" }}>NAS 폴더 변경</button> : null}
          {onUseLocalFolder ? <button type="button" disabled={busy} onClick={onUseLocalFolder} style={{ border: 0, padding: "9px 4px", background: "transparent", color: mutedColor, font: "inherit", fontSize: 12, cursor: busy ? "not-allowed" : "pointer" }}>이 기기에서 찾기</button> : null}
        </div>
      </div>

      {job && (job.status === "QUEUED" || job.status === "RUNNING") ? <div style={{ border: `1px solid ${borderColor}`, borderRadius: 12, background: cardColor, padding: 16 }} role="status"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><LoaderCircle size={16} className="spin" />{job.progress?.message || "Mac Studio 작업 대기 중"}</span><b>{progressPercent}%</b></div><div style={{ height: 8, marginTop: 10, borderRadius: 99, overflow: "hidden", background: borderColor }}><div style={{ width: `${progressPercent}%`, height: "100%", background: accentColor }} /></div></div> : null}
      {error ? <div role="alert" style={{ border: "1px solid rgba(229,138,113,.7)", borderRadius: 12, background: dark ? "rgba(201,74,30,.12)" : "#fff0ea", color: dark ? "#F0A98C" : "#a13c20", padding: 16, whiteSpace: "pre-wrap" }}><strong style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={17} />RAW 매칭 실패</strong><p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6 }}>{error}</p></div> : null}
      {result ? <div role="status" style={{ border: `1px solid ${dark ? "rgba(79,216,184,.45)" : "#90b9a8"}`, borderRadius: 12, background: dark ? "rgba(55,195,157,.10)" : "#edf8f2", color: dark ? "#A8F1DC" : C.teal, padding: 16 }}><strong style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={18} />RAW 매칭 완료</strong><p style={{ margin: "8px 0 0", lineHeight: 1.7 }}>확정 {result.confirmed}장 · 새로 복사 {result.copied}장 · 이미 있음 {result.alreadyCopied}장{rawOnly ? "" : ` · JPG ${result.jpgMoved}장 이동 · XMP ${result.xmpMoved}개 이동`} · 확인 필요 {result.needsReview}장</p>{result.failures.length ? <p style={{ margin: "6px 0 0", color: dark ? "#F0A98C" : "#a13c20", fontSize: 12 }}>{result.failures.slice(0, 5).map((failure) => `${failure.fileName}: ${failure.error}`).join(" · ")}</p> : null}</div> : null}
    </section>
  );
}
