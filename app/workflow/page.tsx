"use client";

import Link from "next/link";
import { ApprovalCard, C, EmptyBox, LoadingBox, Pill, SectionCard, StatCard, TaskRow, useApi, WorkflowIcons, WorkflowShell, fmtDate, priorityColor, statusColor } from "./_components";

const fallback = { ok: true, summary: {}, priorityTasks: [], approvals: [], workflowRuns: [] };

export default function WorkflowDashboardPage() {
  const { data, loading, mock, reload } = useApi<any>("/api/workflow/summary", fallback);
  const summary = data.summary || {};
  const runs = data.workflowRuns || [];
  const tasks = data.priorityTasks || [];
  const approvals = data.approvals || [];

  return (
    <WorkflowShell title="올리비아 워크플로우" subtitle="상담부터 촬영, 갤러리 전달, 리뷰 요청, PER 적립까지 병원별 운영 흐름을 관리합니다.">
      {mock ? <div style={{ marginBottom: 14 }}><Pill color={C.orange}>Supabase 테이블 적용 전 샘플 데이터 표시 중</Pill></div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 18 }}>
        <StatCard label="진행 중인 병원" value={summary.activeClients ?? 0} icon={<WorkflowIcons.ListChecks size={20} />} />
        <StatCard label="오늘 처리할 작업" value={summary.todayTasks ?? 0} icon={<WorkflowIcons.Clock size={20} />} />
        <StatCard label="승인 대기" value={summary.pendingApprovals ?? 0} icon={<WorkflowIcons.ShieldCheck size={20} />} />
        <StatCard label="발송 대기 메일" value={summary.pendingMailing ?? 0} icon={<WorkflowIcons.FileText size={20} />} />
        <StatCard label="촬영 예정" value={summary.shootingToday ?? 0} />
        <StatCard label="갤러리 전달 대기" value={summary.galleryWaiting ?? 0} />
        <StatCard label="리뷰 요청 대기" value={summary.reviewWaiting ?? 0} />
        <StatCard label="PER 적립 대기" value={summary.perWaiting ?? 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 18, alignItems: "start", marginBottom: 18 }}>
        <SectionCard title="오늘의 우선 작업" action={<Link href="/workflow/tasks" style={{ color: C.green, fontSize: 12, fontWeight: 900, textDecoration: "none" }}>전체 작업 큐 →</Link>}>
          {loading ? <LoadingBox /> : tasks.length ? tasks.slice(0, 5).map((task: any) => <TaskRow key={task.id} task={task} onRefresh={reload} />) : <EmptyBox text="오늘 처리할 작업이 없습니다." />}
        </SectionCard>
        <SectionCard title="승인 대기함" action={<Link href="/workflow/approvals" style={{ color: C.green, fontSize: 12, fontWeight: 900, textDecoration: "none" }}>승인함 →</Link>}>
          {loading ? <LoadingBox /> : approvals.length ? <div style={{ display: "grid", gap: 12 }}>{approvals.slice(0, 2).map((approval: any) => <ApprovalCard key={approval.id} approval={approval} onRefresh={reload} />)}</div> : <EmptyBox text="승인 대기 항목이 없습니다." />}
        </SectionCard>
      </div>

      <SectionCard title="병원별 현재 진행상태">
        {loading ? <LoadingBox /> : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 920 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 140px 1.3fr 120px 90px 90px 90px", gap: 12, color: C.hint, fontSize: 11, fontWeight: 1000, paddingBottom: 10, borderBottom: `1px solid ${C.line}` }}>
                <span>병원명</span><span>프로젝트</span><span>현재 단계</span><span>다음 액션</span><span>담당자</span><span>촬영일</span><span>지연</span><span>상세</span>
              </div>
              {runs.map((run: any) => (
                <div key={run.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 140px 1.3fr 120px 90px 90px 90px", gap: 12, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.line}` }}>
                  <strong style={{ color: C.green, fontSize: 14 }}>{run.client_name || "-"}</strong>
                  <span style={{ color: C.muted, fontSize: 13 }}>{run.project_name || "-"}</span>
                  <Pill color={statusColor[run.status] || C.green}>{run.current_step_name || run.current_step_key}</Pill>
                  <span style={{ color: C.text, fontSize: 13 }}>{run.next_action || "-"}</span>
                  <span style={{ color: C.muted, fontSize: 13 }}>{run.manager_name || "-"}</span>
                  <span style={{ color: C.muted, fontSize: 13 }}>{fmtDate(run.shoot_date)}</span>
                  <Pill color={run.delayed ? C.orange : C.hint}>{run.delayed ? "지연" : "정상"}</Pill>
                  <Link href={`/workflow/tasks?run=${run.id}`} style={{ color: C.orange, fontWeight: 900, fontSize: 12, textDecoration: "none" }}>보기 →</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </WorkflowShell>
  );
}
