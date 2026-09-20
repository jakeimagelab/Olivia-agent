"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  action: string;
  status: string;
  result?: Record<string, unknown> | null;
  progress?: { message?: string; current?: number; total?: number } | null;
  message?: string | null;
  error?: string | null;
};

const LABELS: Record<string, string> = {
  PHOTO_RAW_MATCH: "RAW 매칭",
  PHOTO_RESIZE: "사진 리사이즈",
  PHOTO_AI_SELECT: "AI 컷 정리",
  PHOTO_RETOUCH: "사진 보정 분석",
};

function resultSummary(job: Job): string {
  if (job.status === "FAILED") return job.error || "작업 중 확인이 필요합니다. 원본은 변경되지 않았습니다.";
  if (job.status !== "COMPLETED") return job.progress?.message || job.message || "Mac Studio에서 작업 중입니다.";
  const result = job.result ?? {};
  if (job.action === "PHOTO_RAW_MATCH") return `선택 ${Number(result.selectedCount || 0).toLocaleString("ko-KR")}장 · RAW 매칭 ${Number(result.matchedCount || 0).toLocaleString("ko-KR")}장 · 원본 ${result.rawSourceUnchanged === true ? "보존 확인" : "확인 필요"}`;
  if (job.action === "PHOTO_RESIZE") return `${Number(result.sourceCount || 0).toLocaleString("ko-KR")}장 중 ${Number(result.completedCount || 0).toLocaleString("ko-KR")}장 완료 · 메타데이터 ${result.metadataPreserved === true ? "보존 확인" : "확인 필요"}`;
  if (job.action === "PHOTO_AI_SELECT") return `전체 ${Number(result.totalCount || 0).toLocaleString("ko-KR")}장 · 추천 ${Number(result.selectedCount || 0).toLocaleString("ko-KR")}장 · 중복 제외 ${Number(result.duplicateRemovedCount || 0).toLocaleString("ko-KR")}장`;
  if (job.action === "PHOTO_RETOUCH") return `${Number(result.analyzedCount || 0).toLocaleString("ko-KR")}장 분석 완료 · 원본 사진은 수정하지 않았습니다.`;
  return "작업이 완료되었습니다.";
}

function retouchGuides(job: Job): Array<{ fileName: string; guide: string }> {
  if (job.action !== "PHOTO_RETOUCH" || !Array.isArray(job.result?.results)) return [];
  return job.result.results.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const analysis = row.analysis && typeof row.analysis === "object" ? row.analysis as Record<string, unknown> : null;
    const photoshop = analysis?.photoshop && typeof analysis.photoshop === "object" ? analysis.photoshop as Record<string, unknown> : null;
    const guide = Array.isArray(photoshop?.guide) ? photoshop.guide.filter((value): value is string => typeof value === "string").join(" · ") : "조정 불필요 또는 검출 안 됨";
    return [{ fileName: typeof row.fileName === "string" ? row.fileName : "사진", guide }];
  });
}

export default function RemotePhotoOperationResultBanner({ jobId }: { jobId: string | null }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!jobId) { setJob(null); setError(""); return; }
    const request = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const response = await fetch(`/api/remote-jobs?id=${encodeURIComponent(jobId)}`, { cache: "no-store", signal: request.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "작업 결과를 불러오지 못했습니다.");
        setJob(body.job);
        setError("");
        if (body.job?.status !== "COMPLETED" && body.job?.status !== "FAILED") timer = setTimeout(() => void load(), 2_000);
      } catch (caught) {
        if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : "작업 결과를 불러오지 못했습니다.");
        if (!request.signal.aborted) timer = setTimeout(() => void load(), 3_000);
      }
    };
    void load();
    return () => { if (timer) clearTimeout(timer); request.abort(); };
  }, [jobId]);

  if (!jobId) return null;
  const color = job?.status === "FAILED" || error ? "#B42318" : "#155855";
  const guides = job ? retouchGuides(job) : [];
  return (
    <section style={{ margin: "0 0 14px", padding: "12px 14px", borderRadius: 14, border: `1px solid ${color}22`, background: job?.status === "FAILED" || error ? "#FFF4F2" : "#EFF7F5", color }} aria-live="polite">
      <div style={{ fontSize: 13, fontWeight: 700 }}>{job ? `${LABELS[job.action] || "Mac Studio 사진 작업"} · ${job.status === "COMPLETED" ? "완료" : job.status === "FAILED" ? "확인 필요" : "진행 중"}` : "Mac Studio 작업 결과 확인"}</div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.55, color: "#526B67" }}>{error || (job ? resultSummary(job) : "작업 결과를 불러오는 중입니다.")}</div>
      {guides.length ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6, color: "#526B67" }}>
          {guides.map((entry) => <li key={entry.fileName}><strong>{entry.fileName}</strong> · {entry.guide}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
