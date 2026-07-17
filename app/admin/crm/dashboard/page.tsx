"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";
import { WORKFLOW_STAGES } from "@/lib/workflow";

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

function runBadge(run: WorkflowRun): { label: string; cls: string } {
  if (run.waiting_approval_count > 0) return { label: "승인 대기", cls: "crm-card-status--wait" };
  if (run.waiting_customer) return { label: "고객 대기", cls: "crm-card-status--client" };
  if (run.delayed) return { label: "지연", cls: "crm-card-status--delayed" };
  return { label: "진행중", cls: "crm-card-status--approved" };
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

  const latestAlert = failedTasks[0] ? { name: failedTasks[0].client_name || "고객 미연결", text: "작업이 실패했습니다" }
    : delayedRuns[0] ? { name: delayedRuns[0].client_name, text: "촬영일이 지났습니다" }
    : retentionAlerts[0] ? { name: (retentionAlerts[0] as any).client_name || "고객 미연결", text: "데이터 보관 만료가 임박했습니다" }
    : null;

  return (
    <div className="oa-page pc-dash-home">
      {alertCount > 0 && latestAlert && (
        <div className="crm-alarm">
          <span className="crm-alarm-icon"><Mail size={14}/></span>
          <div className="crm-alarm-text"><strong>{latestAlert.name}</strong>{`에서 ${latestAlert.text}`} · 그 외 {Math.max(alertCount - 1, 0)}건</div>
          <Link className="crm-alarm-link" href="/admin/crm/issues">확인하러 가기 →</Link>
        </div>
      )}

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

      <div className="oa-dashboard-layout pc-dash-layout">
        <div className="oa-main-column">
          <CategorySection
            eyebrow="PIPELINE"
            title="진행 현황"
            description="4개 스테이지 기준으로 진행 상태를 확인합니다. 카드를 클릭하면 프로젝트 상세로 이동합니다."
          >
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
                    <span><span className={`crm-card-status ${badge.cls}`}>{badge.label}</span></span>
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
