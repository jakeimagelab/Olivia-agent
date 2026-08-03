"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { C } from "@/lib/theme";

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "대기", running: "처리 중", waiting_approval: "승인 대기",
  completed: "완료", failed: "오류", canceled: "생략됨",
};

export default function NextActionCard({
  client,
  workflowRun,
  stepIcon,
  stepDescription,
  onRefresh,
}: {
  client: any;
  workflowRun: any;
  stepIcon?: string;
  stepDescription?: string;
  onRefresh?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(workflowRun?.id));
  const [busy, setBusy] = useState(false);
  const [additionalBusy, setAdditionalBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  // 완료되지 않은 항목은 기본적으로 전부 체크된 것으로 취급하고, 사용자가 명시적으로
  // 해제한 항목만 이 Set에 담는다 — 매 로드마다 다시 체크해줄 필요가 없다.
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    if (!workflowRun?.id) return;
    setLoading(true);
    const res = await fetch(`/api/workflow/next-action?workflowRunId=${workflowRun.id}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setData(json);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workflowRun?.id]);
  useEffect(() => { setUncheckedIds(new Set()); }, [workflowRun?.id, data?.currentStepKey]);

  if (!workflowRun?.id) {
    return (
      <section className="pcrm-current-step-card">
        <div className="pcrm-current-step-card__left">
          <div className="pcrm-current-step-card__body">
            <span className="pcrm-current-step-card__label">현재 단계</span>
            <h2 className="pcrm-current-step-card__title">{client.name}</h2>
            <p className="pcrm-current-step-card__desc">진행 중인 워크플로우가 없습니다.</p>
          </div>
        </div>
      </section>
    );
  }

  const action = data || {};
  const isCompleted = workflowRun.status === "completed" || action.primaryAction === "completed";
  const appHref = buildStepAppLink({
    stepKey: action.currentStepKey || workflowRun.current_step_key,
    clientId: client.id,
    workflowRunId: workflowRun.id,
  });

  // 이 단계에 필요한 업무 목록 — 승인이 필요한 업무는 agent_tasks 1건 + agent_approvals 1건이
  // 함께 생기므로(예: 견적서 단계는 "견적 초안"과 "견적 메일 초안" 2건), 태스크 단위로 묶어서
  // 하나의 체크리스트 항목으로 보여준다. 이걸 못 보고 하나만 승인하면 나머지 승인이 남아있어도
  // 다음 단계로 안 넘어가는데, 그게 겉으론 "다 처리했는데 안 넘어간다"는 버그처럼 보인다.
  const checklistItems: { task: any; approval: any }[] = (action.tasks ?? []).map((task: any) => ({
    task,
    approval: (action.approvals ?? []).find((a: any) => a.agent_task_id === task.id) ?? null,
  }));
  const isChecked = (taskId: string) => !uncheckedIds.has(taskId);
  const toggleChecked = (taskId: string) => {
    setUncheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };
  const actionableItems = checklistItems.filter((item) => item.task.status !== "completed" && item.task.status !== "canceled");
  const selectedActionableItems = actionableItems.filter((item) => isChecked(item.task.id));

  const bulkProcessSelected = async () => {
    setBulkBusy(true);
    setMsg("");
    try {
      const results = await Promise.all(selectedActionableItems.map(async (item) => {
        const endpoint = item.task.status === "waiting_approval" && item.approval?.status === "pending"
          ? `/api/agent/approvals/${item.approval.id}/approve`
          : `/api/agent/tasks/${item.task.id}/run`;
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        return res.json();
      }));
      const failed = results.filter((r) => !r.ok);
      setMsg(failed.length ? `${failed.length}건 처리 실패: ${failed[0]?.error ?? ""}` : "선택한 업무를 처리했습니다.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "일괄 처리 중 오류가 발생했습니다.");
    } finally {
      setBulkBusy(false);
      await load();
      onRefresh?.();
    }
  };

  const runCurrentStep = async () => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/workflow/run-current-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowRunId: workflowRun.id }),
    });
    const json = await res.json();
    setMsg(json.message || (json.ok ? "처리되었습니다." : json.error || "오류가 발생했습니다."));
    setBusy(false);
    await load();
    onRefresh?.();
  };

  const advance = async () => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/workflow/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: workflowRun.id, reason: "NextActionCard manual advance" }),
    });
    const json = await res.json();
    setMsg(json.ok ? "다음 단계로 이동했습니다." : json.error || "오류가 발생했습니다.");
    setBusy(false);
    await load();
    onRefresh?.();
  };

  const startAdditionalShooting = async () => {
    setAdditionalBusy(true);
    setMsg("");
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/workflow/runs/${workflowRun.id}/additional-shooting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_step_key: "quote" }),
      });
      const json = await res.json();
      setMsg(json.ok ? "추가 촬영 하위 워크플로우를 생성했습니다." : json.error || "추가 촬영 생성에 실패했습니다.");
      if (json.ok) onRefresh?.();
    } finally {
      setAdditionalBusy(false);
    }
  };

  const primaryButton = () => {
    if (isCompleted) return null;
    if (action.primaryAction === "run_current_step") {
      return <button onClick={runCurrentStep} disabled={busy} className="pc-btn pc-btn--orange pc-btn--sm">{busy ? "처리 중..." : action.primaryActionLabel}</button>;
    }
    if (action.primaryAction === "approve_required") {
      return <Link href="/workflow/approvals" className="pc-btn pc-btn--orange pc-btn--sm">{action.primaryActionLabel}</Link>;
    }
    if (action.primaryAction === "send_ready_mail") {
      return <Link href={`/mailing?clientId=${client.id}&workflowRunId=${workflowRun.id}&stepKey=${action.currentStepKey}`} className="pc-btn pc-btn--orange pc-btn--sm">{action.primaryActionLabel}</Link>;
    }
    if (action.primaryAction === "advance_step") {
      return <button onClick={advance} disabled={busy} className="pc-btn pc-btn--orange pc-btn--sm">{busy ? "이동 중..." : action.primaryActionLabel}</button>;
    }
    if (action.primaryAction === "fix_failed_task") {
      return <Link href="/workflow/tasks?status=failed" className="pc-btn pc-btn--orange pc-btn--sm">{action.primaryActionLabel}</Link>;
    }
    return <Link href={appHref} className="pc-btn pc-btn--orange pc-btn--sm">{action.primaryActionLabel || "관련 앱 열기"}</Link>;
  };

  return (
    <section className="pcrm-current-step-card">
      <div className="pcrm-current-step-card__left">
        <div className="pcrm-current-step-card__icon">{stepIcon || "🟠"}</div>
        <div className="pcrm-current-step-card__body">
          <span className="pcrm-current-step-card__label">현재 단계</span>
          <h2 className="pcrm-current-step-card__title">{isCompleted ? "모든 단계 완료" : loading ? "불러오는 중..." : action.currentStepName || client.name}</h2>
          <p className="pcrm-current-step-card__desc">{isCompleted ? "워크플로우의 모든 단계가 완료되었습니다." : stepDescription || action.nextActionLabel || action.label}</p>
          {msg ? <p style={{ margin: "3px 0 0", color: msg.includes("오류") ? C.danger : "#155855", fontSize: 11, fontWeight: 800 }}>{msg}</p> : null}
        </div>
      </div>
      {!isCompleted && (
        <div className="pcrm-current-step-card__actions">
          <Link href={appHref} className="pc-btn pc-btn--secondary pc-btn--sm">관련 앱 열기</Link>
          {primaryButton()}
          <div className="pcrm-row-menu">
            <button type="button" className="pc-btn pc-btn--ghost pc-btn--sm" aria-label="더보기" onClick={() => setMenuOpen((v) => !v)}>
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="pcrm-row-menu__scrim" onClick={() => setMenuOpen(false)} />
                <div className="pcrm-row-menu__panel">
                  <Link href="/workflow/approvals" onClick={() => setMenuOpen(false)}>승인 대기 보기</Link>
                  {workflowRun.run_kind !== "additional_shooting" && (
                    <button type="button" disabled={additionalBusy} onClick={startAdditionalShooting}>
                      {additionalBusy ? "생성 중..." : "+ 추가 촬영 시작"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
