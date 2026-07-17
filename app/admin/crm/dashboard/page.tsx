"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardCheck, FolderKanban,
  RefreshCw, UserRoundCheck, UsersRound, Clock3,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge, { type StatusBadgeTone } from "@/components/admin/StatusBadge";
import { WORKFLOW_STAGES } from "@/lib/workflow";

type WorkflowRun = {
  id: string;
  client_id: string;
  client_name: string;
  project_name: string;
  current_step_name: string;
  stage_key: string;
  stage_name: string;
  progress: number;
  status: string;
  delayed: boolean;
  waiting_approval_count: number;
  revision_request_count: number;
  waiting_customer: boolean;
  shoot_date?: string;
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
  mock?: boolean;
};

function runBadge(run: WorkflowRun): { label: string; tone: StatusBadgeTone } {
  if (run.waiting_approval_count > 0) return { label: "승인대기", tone: "orange" };
  if (run.waiting_customer) return { label: "고객대기", tone: "blue" };
  if (run.delayed) return { label: "지연", tone: "red" };
  return { label: "진행중", tone: "green" };
}

export default function CrmDashboardPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const summary = data?.summary;
  const runs = data?.workflowRuns ?? [];
  const delayedRuns = data?.automation.delayedRuns ?? [];
  const failedTasks = data?.automation.failedTasks ?? [];
  const retentionAlerts = data?.automation.retentionAlerts ?? [];
  const alertCount = delayedRuns.length + failedTasks.length + retentionAlerts.length;

  const recommendations: string[] = [];
  if (summary) {
    if (summary.pendingApprovals > 0) recommendations.push(`승인 대기 ${summary.pendingApprovals}건을 확인하세요.`);
    if (delayedRuns.length > 0) recommendations.push(`촬영일이 지난 프로젝트 ${delayedRuns.length}건에 리마인드를 보내세요.`);
    if (summary.waitingCustomer > 0) recommendations.push(`고객 응답 대기 ${summary.waitingCustomer}건을 후속 관리로 챙기세요.`);
    if (retentionAlerts.length > 0) recommendations.push(`데이터 보관 만료 임박 ${retentionAlerts.length}건을 확인하세요.`);
  }

  return (
    <div className="oa-page pc-dash-home">
      {alertCount > 0 && (
        <section className="oa-context-banner is-linked" style={{ marginBottom: 16 }}>
          <span className="oa-context-banner__icon"><AlertTriangle size={19}/></span>
          <div className="oa-context-banner__copy">
            <strong>확인이 필요한 항목이 {alertCount}건 있습니다.</strong>
            <p>
              {[
                delayedRuns.length > 0 && `지연 ${delayedRuns.length}건`,
                failedTasks.length > 0 && `실패 ${failedTasks.length}건`,
                retentionAlerts.length > 0 && `보관 만료 임박 ${retentionAlerts.length}건`,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link className="oa-context-banner__action" href="/admin/crm/issues">확인하러 가기</Link>
        </section>
      )}

      <section className="oa-summary-grid oa-summary-grid--crm pc-dash-summary" aria-label="CRM 현황 요약">
        <SummaryCard label="승인 대기" value={loading ? "–" : summary?.pendingApprovals ?? 0} description="대표 확인 필요" icon={<ClipboardCheck size={18}/>} tone="orange"/>
        <SummaryCard label="진행중" value={loading ? "–" : summary?.activeProjects ?? 0} description="활성 프로젝트" icon={<FolderKanban size={18}/>} tone="blue"/>
        <SummaryCard label="이번달 완료" value={loading ? "–" : summary?.completedThisMonth ?? 0} description="이번 달 완료 건수" icon={<CheckCircle2 size={18}/>} tone="green"/>
        <SummaryCard label="고객 응답 대기" value={loading ? "–" : summary?.waitingCustomer ?? 0} description="고객 액션 필요" icon={<Clock3 size={18}/>} tone="red"/>
      </section>

      <div className="oa-dashboard-layout pc-dash-layout">
        <div className="oa-main-column">
          <CategorySection
            eyebrow="PIPELINE"
            title="프로젝트 보드"
            description="4개 스테이지 기준으로 진행 상태를 확인합니다. 카드를 클릭하면 프로젝트 상세로 이동합니다."
          >
            <div className="oa-board-preview">
              {WORKFLOW_STAGES.map((stage) => {
                const stageRuns = runs.filter((run) => run.stage_key === stage.key && run.status === "active");
                return (
                  <div className="oa-board-column" key={stage.key}>
                    <header><strong>{stage.name}</strong><StatusBadge tone="gray">{stageRuns.length}</StatusBadge></header>
                    {stageRuns.length === 0 && !loading ? (
                      <p style={{ fontSize: 9, color: "#a7adb2", padding: "8px 2px" }}>진행중 프로젝트 없음</p>
                    ) : stageRuns.slice(0, 6).map((run, index) => {
                      const badge = runBadge(run);
                      return (
                        <Link key={run.id} href={`/clients?id=${run.client_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <article>
                            <span className="oa-project-index">0{index + 1}</span>
                            <div>
                              <strong>{run.client_name}</strong>
                              <p>{run.current_step_name}</p>
                              <div style={{ height: 3, background: "#eef1f2", borderRadius: 99, marginTop: 5, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${run.progress}%`, background: "var(--brand-orange)", borderRadius: 99 }}/>
                              </div>
                            </div>
                            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                          </article>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CategorySection>

          <CategorySection eyebrow="CUSTOMERS" title="최근 고객" action={<Link className="oa-text-link" href="/clients">고객 목록 열기</Link>}>
            <div className="oa-customer-table">
              <div className="oa-table-head"><span>고객</span><span>프로젝트</span><span>현재 단계</span><span>상태</span></div>
              {runs.slice(0, 6).map((run) => {
                const badge = runBadge(run);
                return (
                  <div className="oa-table-row" key={run.id}>
                    <span className="is-strong">{run.client_name}</span>
                    <span>{run.project_name}</span>
                    <span>{run.current_step_name}</span>
                    <span><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></span>
                  </div>
                );
              })}
              {runs.length === 0 && !loading && <div style={{ padding: "20px 10px", fontSize: 11, color: "#a7adb2" }}>진행중인 고객이 없습니다.</div>}
            </div>
          </CategorySection>
        </div>

        <aside className="oa-right-column" aria-label="CRM 보조 패널">
          <CategorySection eyebrow="ISSUES" title="지연 / 확인 필요" action={<StatusBadge tone="red">{alertCount}건</StatusBadge>}>
            <div className="oa-issue-list">
              {delayedRuns.slice(0, 3).map((run) => (
                <div key={run.id}><AlertTriangle size={17}/><p><strong>촬영일 지연</strong><span>{run.client_name} · {run.project_name}</span></p></div>
              ))}
              {retentionAlerts.slice(0, 2).map((task: any, i: number) => (
                <div key={task.id ?? i}><AlertTriangle size={17}/><p><strong>데이터 보관 만료 임박</strong><span>{task.client_name || "고객 미연결"}</span></p></div>
              ))}
              {alertCount === 0 && !loading && <p style={{ fontSize: 11, color: "#a7adb2", padding: "6px 2px" }}>확인이 필요한 항목이 없습니다.</p>}
            </div>
          </CategorySection>

          <OliviaRecommendationPanel items={recommendations}/>

          <CategorySection eyebrow="CRM" title="빠른 이동">
            <div className="oa-link-list">
              <Link href="/clients"><UsersRound size={17}/><span>고객 목록</span></Link>
              <Link href="/admin/crm/workflows"><RefreshCw size={17}/><span>프로젝트 워크플로우</span></Link>
              <Link href="/workflow/approvals"><ClipboardCheck size={17}/><span>승인 대기함</span></Link>
              <Link href="/admin/crm/aftercare"><UserRoundCheck size={17}/><span>후속 관리</span></Link>
            </div>
          </CategorySection>
        </aside>
      </div>
    </div>
  );
}
