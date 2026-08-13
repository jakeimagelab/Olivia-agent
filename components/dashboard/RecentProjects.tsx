"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { navigateToFeature } from "@/lib/olivia/features/navigationBridge";

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
  const setClient = useOliviaContextStore((state) => state.setClient);
  const setProject = useOliviaContextStore((state) => state.setProject);
  const recordAction = useOliviaContextStore((state) => state.recordAction);

  useEffect(() => {
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data?.workflowRuns)) return;
        const active = (data.workflowRuns as WorkflowRun[])
          .filter((run) => run.status === "active")
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 3);
        setRuns(active);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="pc-panel">
      <div className="pc-panel__header">
        <h3>최근 프로젝트</h3>
        <Link href="/clients" className="pc-text-button">전체 보기</Link>
      </div>

      <div className="pc-recent-projects__list">
        {runs === null ? (
          <div className="pc-panel__empty">불러오는 중...</div>
        ) : runs.length === 0 ? (
          <div className="pc-panel__empty">진행 중인 프로젝트가 없어요.</div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="pc-project-row"
              onClick={() => {
                setClient(run.client_id || undefined, run.client_name);
                setProject(run.id, run.client_name ? `${run.client_name} 프로젝트` : undefined);
                recordAction(`project:selected:${run.id}`);
                // 자연어 채팅에 해석을 맡기지 않고 실제 고객 화면으로 바로 이동한다 —
                // 클릭했는데 아무 화면도 안 열리는 것처럼 보이는 문제를 없앤다.
                navigateToFeature(run.client_id ? `/clients?clientId=${run.client_id}` : "/clients");
              }}
            >
              <div className="pc-project-row__main">
                <strong>{run.client_name || "이름 없는 고객"}</strong>
                <span className="pc-project-row__status">{run.current_step_name}</span>
                <small>다음 · {STEP_NEXT_ACTION[run.display_step_key] || run.current_step_name}</small>
              </div>
              <span className="pc-project-row__time">{relativeTime(run.updated_at)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
