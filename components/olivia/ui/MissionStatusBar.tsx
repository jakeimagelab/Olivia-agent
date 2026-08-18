"use client";

import Link from "next/link";
import { Calendar, ChevronRight, User } from "lucide-react";

export type MissionStatusBarProps = {
  /** 카드 상단 라벨(기본 "현재 미션") 옆에 붙는 실제 미션 제목 — 보통 "{고객명} {프로젝트명}" */
  title: string;
  /** "진행 중" / "완료" 등 상태 배지 텍스트. 생략하면 배지를 그리지 않는다. */
  status?: string;
  currentStage?: string;
  nextScheduleLabel?: string;
  owner?: string;
  /** 0~100. undefined면 진행률 영역을 그리지 않는다. */
  progress?: number;
  detailHref?: string;
  loading?: boolean;
};

// 코드 요청서 — Olivia UI/UX 통일 개편(2026-08-18) 40절: Home/고객관리/캘린더/견적/콘티가
// 공유하는 "현재 미션" 바. 각 페이지가 이미 들고 있는 workflow_runs 데이터를 그대로 넘기기만
// 하면 되고, 이 컴포넌트 자체는 데이터를 새로 조회하지 않는다(existing context/workflow data 재사용).
export default function MissionStatusBar({ title, status, currentStage, nextScheduleLabel, owner, progress, detailHref, loading }: MissionStatusBarProps) {
  if (loading) {
    return (
      <div className="olivia-mission-bar olivia-mission-bar--loading" aria-hidden="true">
        <div className="olivia-mission-bar__skeleton" />
      </div>
    );
  }

  // 시안 18절 — grid-template-columns: 1.3fr 1fr 1fr 1fr 1.2fr auto 6칸을 그대로 맞추려면
  // 각 항목이 래퍼 없이 grid의 직계 자식이어야 한다(예전엔 metrics 하나로 묶여있었음).
  return (
    <div className="olivia-mission-bar">
      <div className="olivia-mission-bar__title">
        <span className="olivia-mission-bar__label">현재 미션</span>
        <strong>{title}</strong>
        {status ? <span className="olivia-mission-bar__badge">{status}</span> : null}
      </div>

      <div className="olivia-mission-bar__metric">
        {currentStage ? (<><span className="olivia-mission-bar__metric-label">현재 단계</span><span className="olivia-mission-bar__metric-value olivia-mission-bar__metric-value--stage">{currentStage}</span></>) : null}
      </div>

      <div className="olivia-mission-bar__metric">
        {nextScheduleLabel ? (<><span className="olivia-mission-bar__metric-label"><Calendar size={12} aria-hidden="true" /> 다음 일정</span><span className="olivia-mission-bar__metric-value">{nextScheduleLabel}</span></>) : null}
      </div>

      <div className="olivia-mission-bar__metric">
        {owner ? (<><span className="olivia-mission-bar__metric-label"><User size={12} aria-hidden="true" /> 담당자</span><span className="olivia-mission-bar__metric-value">{owner}</span></>) : null}
      </div>

      <div className="olivia-mission-bar__metric olivia-mission-bar__metric--progress">
        {progress !== undefined ? (
          <>
            <span className="olivia-mission-bar__metric-label">전체 진행률</span>
            <span className="olivia-mission-bar__progress">
              <span className="olivia-mission-bar__progress-track">
                <span className="olivia-mission-bar__progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </span>
              <strong>{Math.round(progress)}%</strong>
            </span>
          </>
        ) : null}
      </div>

      {detailHref ? (
        <Link href={detailHref} className="olivia-mission-bar__detail">
          미션 상세 보기 <ChevronRight size={13} aria-hidden="true" />
        </Link>
      ) : <span />}
    </div>
  );
}
