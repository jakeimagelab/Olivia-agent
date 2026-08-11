"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderKanban } from "lucide-react";

// app/(client-hub)/clients/page.tsx의 STEP_INFO와 같은 취지의 "다음 업무" 설명 — 그 파일은 export를
// 안 해서 여기서는 홈 카드에 필요한 만큼만 작게 다시 쓴다.
const STEP_NEXT_ACTION: Record<string, string> = {
  consult_meeting: "병원 기본 정보 등록 · 상담 내용 정리",
  quote: "견적서 작성 및 전달",
  contract: "계약서 작성 및 전달",
  conti: "촬영 콘티 및 체크리스트 준비",
  shooting: "촬영 장비 및 준비사항 확인",
  payment_confirm: "잔금 입금 확인",
  backup_sorting: "원본 파일 백업 및 분류",
  original_delivery: "원본 파일 전달",
  client_selection: "고객 사진 셀렉 대기",
  retouching: "보정 작업 진행",
  revision: "수정본 업로드",
  seo_delivery: "SEO 메타데이터 처리",
  final_delivery: "최종 파일 전달",
  review_content: "리뷰 콘텐츠 변환",
  reward: "고객 리워드 적립",
  customer_care: "고객 케어 메일 발송",
  content_planning: "콘텐츠 기획",
};

type WorkflowRun = {
  id: string;
  client_id: string | null;
  client_name: string;
  status: string;
  current_step_name: string;
  display_step_key: string;
  progress: number;
  updated_at: string;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function RecentProjects() {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);

  useEffect(() => {
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data?.workflowRuns)) return;
        const active = (data.workflowRuns as WorkflowRun[])
          .filter((run) => run.status === "active")
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 5);
        setRuns(active);
      })
      .catch(() => {});
  }, []);

  return (
    <section style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      borderRadius: 22, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)" as any, border: "1px solid rgba(21,88,85,0.08)",
      boxShadow: "0 12px 40px rgba(20,60,55,0.06)", overflow: "hidden",
    }}>
      <div style={{ flexShrink: 0, padding: "16px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 900, color: "#1C2B28" }}>
          <FolderKanban size={15} color="#155855" /> 최근 프로젝트
        </span>
        <Link href="/clients" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#6F7E7A", textDecoration: "none" }}>
          전체 보기 <ArrowRight size={11} />
        </Link>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 10px" }}>
        {runs === null ? (
          <div style={{ padding: "20px 10px", fontSize: 12, color: "#9BB5B0", textAlign: "center" }}>불러오는 중...</div>
        ) : runs.length === 0 ? (
          <div style={{ padding: "20px 10px", fontSize: 12, color: "#9BB5B0", textAlign: "center" }}>진행 중인 프로젝트가 없어요.</div>
        ) : (
          runs.map((run) => (
            <Link
              key={run.id}
              href={run.client_id ? `/clients?clientId=${run.client_id}` : "/clients"}
              style={{ display: "block", padding: "10px 10px", borderRadius: 14, textDecoration: "none", marginBottom: 2 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(21,88,85,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1C2B28", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {run.client_name || "이름 없는 고객"}
                </span>
                <span style={{ fontSize: 9, color: "#9BB5B0", flexShrink: 0, marginLeft: 8 }}>{relativeTime(run.updated_at)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "#155855", background: "#EAF4F2", borderRadius: 99, padding: "2px 8px" }}>
                  {run.current_step_name}
                </span>
                <span style={{ fontSize: 10.5, color: "#6F7E7A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  다음: {STEP_NEXT_ACTION[run.display_step_key] || run.current_step_name}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: "rgba(21,88,85,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(4, run.progress)}%`, background: "linear-gradient(90deg,#155855,#569082)", borderRadius: 99 }} />
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
