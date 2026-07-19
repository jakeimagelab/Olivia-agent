"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import { DailyBriefCard, TodayScheduleCard } from "@/components/dashboard/TodayAlertBanner";
import DailyQuoteWidget from "@/components/dashboard/DailyQuoteWidget";
import { WORKFLOW_STAGES } from "@/lib/workflow";
import OliviaAssistantWorkspace from "@/components/olivia/OliviaAssistantWorkspace";
import RecentActivityWidget from "@/components/admin/RecentActivityWidget";

const STAGE_DOT: Record<string, string> = {
  consult_contract: "var(--orange)",
  prep_shooting: "var(--gold)",
  data_sharing: "var(--purple, #7C3AED)",
  feedback_done: "var(--sage)",
};

type WorkflowRun = {
  id: string;
  client_id: string;
  client_name: string;
  project_name: string;
  current_step_name: string;
  stage_key: string;
  progress: number;
  status: string;
  delayed: boolean;
  waiting_approval_count: number;
  waiting_customer: boolean;
};

type Summary = {
  activeProjects: number;
  pendingApprovals: number;
  completedThisMonth: number;
  waitingCustomer: number;
  failedTasks: number;
  retentionAlerts: number;
};

type SummaryResponse = {
  summary: Summary;
  workflowRuns: WorkflowRun[];
  automation: { delayedRuns: WorkflowRun[]; failedTasks: any[]; retentionAlerts: any[] };
};

function runBadge(run: WorkflowRun): { label: string; cls: string } {
  if (run.waiting_approval_count > 0) return { label: "승인 대기", cls: "crm-card-status--wait" };
  if (run.waiting_customer) return { label: "고객 대기", cls: "crm-card-status--client" };
  if (run.delayed) return { label: "지연", cls: "crm-card-status--delayed" };
  return { label: "진행중", cls: "crm-card-status--approved" };
}

export default function AdminDashboardHomePage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const runs = data?.workflowRuns ?? [];
  const delayedRuns = data?.automation.delayedRuns ?? [];
  const failedTasks = data?.automation.failedTasks ?? [];
  const retentionAlerts = data?.automation.retentionAlerts ?? [];
  const alertCount = delayedRuns.length + failedTasks.length + retentionAlerts.length;

  const latestAlert = failedTasks[0] ? { name: failedTasks[0].client_name || "고객 미연결", text: "작업이 실패했습니다" }
    : delayedRuns[0] ? { name: delayedRuns[0].client_name, text: "촬영일이 지났습니다" }
    : retentionAlerts[0] ? { name: (retentionAlerts[0] as any).client_name || "고객 미연결", text: "데이터 보관 만료가 임박했습니다" }
    : null;

  return (
    <div className="oa-page pc-dash-home crm-dashboard-page">
      <div className="pc-dash-brief">
        <DailyBriefCard/>
        <TodayScheduleCard/>
        <DailyQuoteWidget/>
      </div>

      <section className="crm-kpi-row" aria-label="CRM 현황 요약">
        <div className="crm-kpi crm-kpi--approval">
          <div className="crm-kpi-label">승인 대기</div>
          <div className="crm-kpi-num">{loading ? "–" : summary?.pendingApprovals ?? 0}</div>
          <div className="crm-kpi-trend attn">확인 필요</div>
        </div>
        <div className="crm-kpi crm-kpi--active">
          <div className="crm-kpi-label">진행 중</div>
          <div className="crm-kpi-num">{loading ? "–" : summary?.activeProjects ?? 0}</div>
          <div className="crm-kpi-trend">활성 프로젝트</div>
        </div>
        <div className="crm-kpi crm-kpi--done">
          <div className="crm-kpi-label">이번 달 완료</div>
          <div className="crm-kpi-num">{loading ? "–" : summary?.completedThisMonth ?? 0}</div>
          <div className="crm-kpi-trend">완료 건수</div>
        </div>
        <div className="crm-kpi crm-kpi--waiting">
          <div className="crm-kpi-label">고객 응답 대기</div>
          <div className="crm-kpi-num">{loading ? "–" : summary?.waitingCustomer ?? 0}</div>
          <div className="crm-kpi-trend">셀렉·피드백</div>
        </div>
      </section>

      {alertCount > 0 && latestAlert && (
        <div className="crm-alarm">
          <span className="crm-alarm-icon"><Mail size={14}/></span>
          <div className="crm-alarm-text"><strong>{latestAlert.name}</strong>{`에서 ${latestAlert.text}`}{alertCount > 1 ? ` · 그 외 ${alertCount - 1}건` : ""}</div>
          <div className="crm-alarm-time">방금</div>
        </div>
      )}

      <div className="oa-dashboard-layout pc-dash-layout">
        <div className="oa-main-column">
          <section className="crm-kanban-shell" aria-labelledby="crm-progress-title">
          <div className="crm-kanban-label" id="crm-progress-title">진행 현황 <span>카드 클릭 → 프로젝트 상세</span></div>
          <div className="crm-kanban">
            {WORKFLOW_STAGES.map((stage) => {
              const stageRuns = runs.filter((run) => run.stage_key === stage.key && run.status === "active");
              return (
                <div className="crm-kanban-col" key={stage.key}>
                  <div className="crm-kanban-head">
                    <span className="crm-kanban-dot" style={{ background: STAGE_DOT[stage.key] }}/>
                    <span className="crm-kanban-title">{stage.name}</span>
                    <span className="crm-kanban-count">{stageRuns.length}</span>
                  </div>
                  {stageRuns.length === 0 && !loading ? (
                    <p className="crm-kanban-empty">진행중 프로젝트 없음</p>
                  ) : stageRuns.slice(0, 6).map((run) => {
                    const badge = runBadge(run);
                    return (
                      <Link key={run.id} href={`/clients?id=${run.client_id}`} className="crm-card">
                        <div className="crm-card-name">{run.client_name}</div>
                        <div className="crm-card-meta">{run.current_step_name}</div>
                        <span className={`crm-card-status ${badge.cls}`}>{badge.label}</span>
                        <div className="crm-card-progress"><div className="crm-card-progress-fill" style={{ width: `${run.progress}%` }}/></div>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
          </section>

        </div>

        <aside className="oa-right-column" aria-label="운영 보조 패널">
          <OliviaAssistantWorkspace compact collapsedByDefault/>
          <OliviaRecommendationPanel items={[
            "셀렉 대기 3일차 고객에게 리마인드 메일을 보내세요.",
            "RAW 매칭 완료 고객 2건의 보정 단계를 시작하세요.",
            "최종 납품 완료 고객 3건에 후기 요청을 보내세요.",
          ]}/>
          <RecentActivityWidget/>
        </aside>
      </div>
    </div>
  );
}
