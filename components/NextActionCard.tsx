"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoreVertical } from "lucide-react";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { C } from "@/lib/theme";

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

  const load = async () => {
    if (!workflowRun?.id) return;
    setLoading(true);
    const res = await fetch(`/api/workflow/next-action?workflowRunId=${workflowRun.id}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setData(json);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workflowRun?.id]);

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
