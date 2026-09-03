"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useBackgroundJobsStore, type BackgroundJob } from "@/lib/store/useBackgroundJobsStore";

// RAW 매칭/사진 분류처럼 오래 걸리는 클라이언트 작업이 실행 중일 때, 사용자가 다른 페이지로
// 이동해도 진행 상황을 계속 보여주기 위한 전역 팝업. app/layout.tsx에서 OliviaWorkspaceShell과
// 형제로 마운트되므로 라우트 전환(OliviaPageTransition)과 무관하게 항상 살아있다.
// 우하단 Olivia 챗 위젯(.olivia-floating-core--global, z-index 10020)과 안 겹치게 우상단에 둔다.
const AUTO_DISMISS_MS = 4000;

const C = { teal: "#155855", green: "#22876A", red: "#DC2626", muted: "#5A7470", border: "rgba(21,88,85,.14)", bg: "#FFFFFF" };

function JobCard({ job }: { job: BackgroundJob }) {
  const router = useRouter();
  const dismissJob = useBackgroundJobsStore((state) => state.dismissJob);
  const cancelJob = useBackgroundJobsStore((state) => state.cancelJob);

  useEffect(() => {
    if (job.status === "running") return;
    const timer = setTimeout(() => dismissJob(job.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [job.status, job.id, dismissJob]);

  const pct = job.total > 0 ? Math.min(100, Math.round((job.cur / job.total) * 100)) : 0;
  const statusColor = job.status === "error" ? C.red : job.status === "cancelled" ? C.muted : C.green;
  const statusText = job.status === "done" ? "완료" : job.status === "error" ? "오류" : job.status === "cancelled" ? "중단됨" : null;

  return (
    <div
      onClick={() => router.push(job.returnPath)}
      style={{
        width: 280, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "12px 14px", boxShadow: "0 8px 24px rgba(21,88,85,.14)", cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.teal }}>{job.label}</div>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); dismissJob(job.id); }}
          aria-label="닫기"
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "flex", color: C.muted }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: statusColor, borderRadius: 3, transition: "width .2s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, color: C.muted }}>
        <span>{statusText ? statusText : job.msg || `${job.cur}/${job.total}`}</span>
        {job.status === "running" ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); cancelJob(job.id); }}
            style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", padding: 0 }}
          >
            중단
          </button>
        ) : (
          <span>{job.cur}/{job.total}</span>
        )}
      </div>
    </div>
  );
}

export default function BackgroundJobsWidget() {
  const jobs = useBackgroundJobsStore((state) => state.jobs);
  const jobList = Object.values(jobs);
  if (jobList.length === 0) return null;

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 10025, display: "flex", flexDirection: "column", gap: 8 }}>
      {jobList.map((job) => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
