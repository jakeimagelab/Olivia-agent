"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STEPS,
  getWorkflowDisplayStepKey,
  getWorkflowStepProgress,
} from "@/lib/workflow";

type WorkflowRun = {
  id: string;
  client_id?: string | null;
  client_name?: string;
  project_name?: string;
  current_step_key: string;
  current_step_name?: string;
  stage_key?: string;
  stage_name?: string;
  progress?: number;
  status: string;
  delayed?: boolean;
  waiting_approval_count?: number;
  revision_request_count?: number;
  waiting_customer?: boolean;
  can_advance?: boolean;
};

type DashboardPayload = {
  summary: {
    pendingApprovals?: number;
    activeProjects?: number;
    activeClients?: number;
    completedThisMonth?: number;
    waitingCustomer?: number;
    failedTasks?: number;
  };
  workflowRuns: WorkflowRun[];
  mock?: boolean;
};

const STAGE_COLORS: Record<string, string> = {
  consult_contract: "#E85D2C",
  prep_shooting: "#EB8F22",
  data_sharing: "#7C3AED",
  feedback_done: "#569082",
};

export default function AdminDashboardHomePage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetch("/api/workflow/summary", { cache: "no-store" });
      const json = await response.json();
      if (json.ok) setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeRuns = useMemo(
    () => (data?.workflowRuns ?? []).filter((run) => run.status === "active"),
    [data?.workflowRuns],
  );

  const groupedRuns = useMemo(() => {
    const grouped = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage.key, [] as WorkflowRun[]]));
    for (const run of activeRuns) {
      grouped[getStageKey(run)].push(run);
    }
    return grouped;
  }, [activeRuns]);

  const summary = data?.summary;
  const kpis = [
    { label: "승인 대기", value: summary?.pendingApprovals ?? 0, description: "대표 확인이 필요한 항목", icon: <ShieldCheck size={18} strokeWidth={1.8}/>, tone: "orange" as const },
    { label: "진행 중", value: summary?.activeProjects ?? summary?.activeClients ?? 0, description: "현재 운영 중인 프로젝트", icon: <Clock3 size={18} strokeWidth={1.8}/>, tone: "blue" as const },
    { label: "이번 달 완료", value: summary?.completedThisMonth ?? 0, description: "최종 완료된 프로젝트", icon: <CheckCircle2 size={18} strokeWidth={1.8}/>, tone: "green" as const },
    { label: "고객 응답 대기", value: summary?.waitingCustomer ?? 0, description: "확인·선택·피드백 대기", icon: <UserRoundCheck size={18} strokeWidth={1.8}/>, tone: "gray" as const },
  ];

  const alertCount = (summary?.failedTasks ?? 0) + activeRuns.filter((run) => run.delayed).length;

  return (
    <div className="oa-page oa-operations-home">
      <section className="oa-operations-hero" aria-labelledby="operations-title">
        <div>
          <span className="oa-operations-eyebrow">LIVE OPERATIONS</span>
          <h2 id="operations-title">오늘 움직여야 할 프로젝트</h2>
          <p>승인과 고객 응답이 필요한 지점을 먼저 보고, 프로젝트 상세에서 바로 실행하세요.</p>
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing} className="oa-refresh-button">
          <RefreshCw size={15} strokeWidth={1.8} className={refreshing ? "is-spinning" : ""}/>
          {refreshing ? "갱신 중" : "새로고침"}
        </button>
      </section>

      <section className="oa-operations-kpis" aria-label="핵심 운영 지표">
        {kpis.map((item) => <SummaryCard key={item.label} {...item} value={loading ? "–" : String(item.value)}/>) }
      </section>

      <section className={`oa-operations-alert ${alertCount ? "is-warning" : "is-clear"}`} aria-live="polite">
        <span className="oa-operations-alert__icon">
          {alertCount ? <AlertTriangle size={17} strokeWidth={1.8}/> : <CheckCircle2 size={17} strokeWidth={1.8}/>}
        </span>
        <div>
          <strong>{alertCount ? `확인이 필요한 운영 알림 ${alertCount}건` : "긴급한 운영 알림이 없습니다"}</strong>
          <p>{alertCount ? "실패 작업과 일정 지연 프로젝트를 먼저 확인해 주세요." : "승인 대기와 고객 응답 대기 프로젝트를 순서대로 처리하면 됩니다."}</p>
        </div>
        <Link href="/workflow/tasks">업무 확인 <ArrowUpRight size={13} strokeWidth={1.8}/></Link>
      </section>

      <section className="oa-operations-board-shell" aria-labelledby="board-title">
        <header className="oa-operations-board-header">
          <div>
            <span>PROJECT FLOW</span>
            <h2 id="board-title">4스테이지 프로젝트 보드</h2>
            <p>카드는 현재 상태를 보여주는 읽기 전용 보드입니다. 이동과 실행은 프로젝트 상세에서 진행합니다.</p>
          </div>
          <span className="oa-board-total">진행 중 {activeRuns.length}</span>
        </header>

        <div className="oa-operations-board">
          {WORKFLOW_STAGES.map((stage, stageIndex) => {
            const runs = groupedRuns[stage.key] ?? [];
            const color = STAGE_COLORS[stage.key] ?? stage.color;
            return (
              <section className="oa-operations-column" key={stage.key} style={{ "--stage-color": color } as React.CSSProperties}>
                <header>
                  <div><span>{String(stageIndex + 1).padStart(2, "0")}</span><strong>{stage.name}</strong></div>
                  <b>{runs.length}</b>
                </header>
                <div className="oa-operations-column__cards">
                  {loading ? (
                    <><BoardSkeleton/><BoardSkeleton/></>
                  ) : runs.length ? runs.map((run) => <ProjectBoardCard key={run.id} run={run}/>) : (
                    <div className="oa-operations-empty">현재 프로젝트 없음</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProjectBoardCard({ run }: { run: WorkflowRun }) {
  const progress = run.progress ?? getWorkflowStepProgress(run.current_step_key);
  const displayKey = getWorkflowDisplayStepKey(run.current_step_key) ?? run.current_step_key;
  const status = getRunStatus(run);
  const href = run.client_id ? `/clients?id=${encodeURIComponent(run.client_id)}` : "/clients";

  return (
    <Link className="oa-project-board-card" href={href}>
      <div className="oa-project-board-card__top">
        <span className={`oa-project-state is-${status.tone}`}>{status.label}</span>
        <ArrowUpRight size={14} strokeWidth={1.7}/>
      </div>
      <strong>{run.client_name || "고객 미지정"}</strong>
      <p>{run.project_name || "촬영 프로젝트"}</p>
      <div className="oa-project-board-card__step">
        <span>{run.current_step_name || WORKFLOW_STEPS.find((step) => step.key === displayKey)?.name || displayKey}</span>
        <b>{progress}%</b>
      </div>
      <div className="oa-project-progress"><span style={{ transform: `scaleX(${Math.max(0, Math.min(progress, 100)) / 100})` }}/></div>
    </Link>
  );
}

function BoardSkeleton() {
  return <div className="oa-project-board-card oa-project-board-card--skeleton" aria-hidden="true"/>;
}

function getStageKey(run: WorkflowRun) {
  if (run.stage_key && WORKFLOW_STAGES.some((stage) => stage.key === run.stage_key)) return run.stage_key;
  const displayKey = getWorkflowDisplayStepKey(run.current_step_key);
  return WORKFLOW_STEPS.find((step) => step.key === displayKey)?.stage ?? "consult_contract";
}

function getRunStatus(run: WorkflowRun) {
  if ((run.revision_request_count ?? 0) > 0) return { label: "수정 요청", tone: "orange" };
  if ((run.waiting_approval_count ?? 0) > 0) return { label: "승인 대기", tone: "yellow" };
  if (run.waiting_customer) return { label: "고객 대기", tone: "blue" };
  if (run.delayed) return { label: "일정 지연", tone: "red" };
  if (run.can_advance) return { label: "진행 가능", tone: "green" };
  return { label: "진행 중", tone: "gray" };
}
