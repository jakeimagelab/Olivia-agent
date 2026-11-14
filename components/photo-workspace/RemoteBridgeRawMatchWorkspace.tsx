"use client";

import { AlertTriangle, CheckCircle2, Link2, LoaderCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
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
) {
  const parts = remotePathParts(selection);
  const projectIndex = parts.length > 1 && /^root-\d+$/iu.test(parts[0]) ? 1 : 0;
  const projectFolderName = parts[projectIndex]?.normalize("NFC") ?? "";
  const currentJpgDirectory = parts.slice(projectIndex + 1).join("/");
  if (!projectFolderName || !currentJpgDirectory) throw new Error("촬영 폴더와 JPG 하위 경로를 확인하지 못했습니다.");
  return {
    projectRoot: {
      projectKey: selection.path,
      folderName: projectFolderName,
      relativePath: projectFolderName,
      kind: "raw" as const,
    },
    currentJpgDirectory,
    selectedJpgs: selectedJpgs.map((jpg) => ({
      name: jpg.name,
      relativePath: [currentJpgDirectory, jpg.relativePath || jpg.name].filter(Boolean).join("/"),
      size: jpg.size,
      captureTimeMs: jpg.timestampSource === "mtime" ? null : jpg.captureTimestamp ?? null,
    })),
    deliveredFolderName: "1차보정본",
    openOutput: true,
  };
}

export default function RemoteBridgeRawMatchWorkspace({
  remoteSelection,
  selectedJpgs,
}: {
  remoteSelection: RemoteNasSelection;
  selectedJpgs: readonly BridgeJpgFile[];
}) {
  const { workerPresence } = usePhotoStudioExecution();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const disabledReason = remoteRawMatchRunDisabledReason(selectedJpgs.length, workerPresence.online);
  const payload = useMemo(() => {
    try {
      return buildRemoteBridgeRawMatchPayload(remoteSelection, selectedJpgs);
    } catch {
      return null;
    }
  }, [remoteSelection, selectedJpgs]);
  const result = job?.status === "COMPLETED" ? job.result ?? null : null;
  const progressCurrent = job?.progress?.current ?? 0;
  const progressTotal = job?.progress?.total ?? selectedJpgs.length;
  const progressPercent = progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : 0;

  const run = useCallback(async () => {
    if (disabledReason || busy) return;
    if (!payload) {
      setError("촬영 폴더와 JPG 하위 경로를 확인하지 못했습니다.");
      return;
    }
    setBusy(true);
    setError("");
    setJob(null);
    try {
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
      setBusy(false);
    }
  }, [busy, disabledReason, payload]);

  return (
    <section style={{ display: "grid", gap: 14, color: C.txt }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.light, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={18} color={C.teal} aria-hidden="true" />
          <div><strong style={{ fontSize: 15 }}>RAW 매칭 실행</strong><p style={{ margin: "4px 0 0", color: C.muted, fontSize: 12 }}>버튼을 누르면 Mac Studio가 촬영 폴더를 찾고 파일명·촬영시각을 확인합니다.</p></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
          <div style={{ borderRadius: 10, background: C.bg, padding: 14 }}><span style={{ display: "block", color: C.muted, fontSize: 11 }}>확정 셀렉</span><b style={{ display: "block", marginTop: 4, color: C.orange, fontSize: 22 }}>{selectedJpgs.length.toLocaleString("ko-KR")}장</b></div>
          <div style={{ borderRadius: 10, background: C.bg, padding: 14 }}><span style={{ display: "block", color: C.muted, fontSize: 11 }}>처리 범위</span><b style={{ display: "block", marginTop: 6, fontSize: 13 }}>{remoteSelection.displayPath}</b></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" disabled={Boolean(disabledReason) || busy} onClick={() => void run()} style={{ border: 0, borderRadius: 9, padding: "10px 18px", background: Boolean(disabledReason) || busy ? "#afbbb5" : C.orange, color: "white", fontWeight: 700, cursor: Boolean(disabledReason) || busy ? "not-allowed" : "pointer" }}>
            {busy ? "RAW 매칭 실행 중…" : `RAW 매칭 실행 (${selectedJpgs.length.toLocaleString("ko-KR")}장)`}
          </button>
          {disabledReason ? <span style={{ color: "#b4472a", fontSize: 12 }}>{disabledReason}</span> : null}
        </div>
      </div>

      {job && (job.status === "QUEUED" || job.status === "RUNNING") ? <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.light, padding: 16 }} role="status"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><LoaderCircle size={16} className="spin" />{job.progress?.message || "Mac Studio 작업 대기 중"}</span><b>{progressPercent}%</b></div><div style={{ height: 8, marginTop: 10, borderRadius: 99, overflow: "hidden", background: C.border }}><div style={{ width: `${progressPercent}%`, height: "100%", background: C.teal }} /></div></div> : null}
      {error ? <div role="alert" style={{ border: "1px solid #e58a71", borderRadius: 12, background: "#fff0ea", color: "#a13c20", padding: 16, whiteSpace: "pre-wrap" }}><strong style={{ display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={17} />RAW 매칭 실패</strong><p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6 }}>{error}</p></div> : null}
      {result ? <div role="status" style={{ border: "1px solid #90b9a8", borderRadius: 12, background: "#edf8f2", color: C.teal, padding: 16 }}><strong style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle2 size={18} />RAW 매칭 완료</strong><p style={{ margin: "8px 0 0", lineHeight: 1.7 }}>확정 {result.confirmed}장 · 새로 복사 {result.copied}장 · 이미 있음 {result.alreadyCopied}장 · JPG {result.jpgMoved}장 이동 · XMP {result.xmpMoved}개 이동 · 확인 필요 {result.needsReview}장</p>{result.failures.length ? <p style={{ margin: "6px 0 0", color: "#a13c20", fontSize: 12 }}>{result.failures.slice(0, 5).map((failure) => `${failure.fileName}: ${failure.error}`).join(" · ")}</p> : null}</div> : null}
    </section>
  );
}
