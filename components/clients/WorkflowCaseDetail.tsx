"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardList, ExternalLink, FileText, LockKeyhole, Plus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PcrmActivityTimeline from "@/app/(client-hub)/clients/_components/PcrmActivityTimeline";
import {
  WORKFLOW_CHECK_GROUPS,
  WORKFLOW_CHECKS,
  effectiveWorkflowChecks,
  nextWorkflowCheck,
  workflowCheckProgress,
  type WorkflowCheckDefinition,
  type WorkflowChecksState,
} from "@/lib/workflowChecks";
import styles from "./WorkflowCaseDetail.module.css";

type ToolType = "quote" | "contract" | "conti";

function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
}

export default function WorkflowCaseDetail({
  client, workflowRun, activities, resourceIds, reviewHandoff, onBack, onRefresh, onOpenTool, onOpenAction, onOpenPortal,
}: {
  client: any; workflowRun: any; activities: any[];
  resourceIds?: Partial<Record<ToolType | "select_gallery", string | null>>;
  reviewHandoff?: { reviewId: string; reviewText?: string; photoName?: string; photoUrl?: string } | null;
  onBack: () => void; onRefresh: () => void; onOpenTool: (type: ToolType) => void;
  onOpenAction: (check: WorkflowCheckDefinition) => void; onOpenPortal: () => void;
}) {
  const initial = useMemo(() => effectiveWorkflowChecks({ checks: workflowRun?.checks, currentStepKey: workflowRun?.current_step_key, status: workflowRun?.status }), [workflowRun?.checks, workflowRun?.current_step_key, workflowRun?.status]);
  const [checks, setChecks] = useState<WorkflowChecksState>(initial);
  const [savingKey, setSavingKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setChecks(initial), [initial]);
  const progress = workflowCheckProgress(checks);
  const next = nextWorkflowCheck(checks);
  const customEntries = Object.entries(checks).filter(([key]) => key.startsWith("custom_"));
  const reviewStudioHref = reviewHandoff?.reviewId
    ? `/review-studio?reviewId=${encodeURIComponent(reviewHandoff.reviewId)}${reviewHandoff.photoUrl ? `&photoUrl=${encodeURIComponent(reviewHandoff.photoUrl)}&photoName=${encodeURIComponent(reviewHandoff.photoName || "완료사진")}` : ""}`
    : "";

  const save = async (body: Record<string, unknown>, optimistic?: (current: WorkflowChecksState) => WorkflowChecksState) => {
    const before = checks;
    if (optimistic) setChecks(optimistic);
    setSavingKey(String(body.key || body.action || "save"));
    setError("");
    try {
      const response = await fetch(`/api/workflow-runs/${workflowRun.id}/checks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "체크를 저장하지 못했습니다.");
      setChecks(payload.checks);
      setCustomLabel("");
      onRefresh();
    } catch (reason) {
      setChecks(before);
      setError(reason instanceof Error ? reason.message : "체크를 저장하지 못했습니다.");
    } finally { setSavingKey(""); }
  };

  const toggle = (key: string, done: boolean) => save({ key, done }, (current) => ({
    ...current,
    [key]: done
      ? { ...current[key], done: true, by: "user", at: new Date().toISOString() }
      : { ...current[key], done: false, by: "user" },
  }));
  const handlePrimary = () => {
    if (!next) return;
    if (next.actor === "user") void toggle(next.key, true);
    else onOpenAction(next);
  };

  const docs = [
    { key: "quote", label: "견적서", exists: Boolean(resourceIds?.quote), when: "견적서를 만들면 생깁니다" },
    { key: "contract", label: "계약서", exists: Boolean(resourceIds?.contract), when: "계약서를 만들면 생깁니다" },
    { key: "conti", label: "촬영 콘티", exists: Boolean(resourceIds?.conti), when: "콘티를 만들면 생깁니다" },
    { key: "original", label: "원본 사진", exists: Boolean(client.original_photos_link), when: "분류 확인 뒤 열립니다" },
    { key: "final", label: "완료 사진", exists: Boolean(client.retouched_photos_link), when: "완료사진을 전달하면 열립니다" },
  ];

  return (
    <div className={styles.page}>
      <button className={styles.back} type="button" onClick={onBack}><ArrowLeft size={14} /> 촬영 건 목록</button>
      <header className={styles.header}>
        <div>
          <div className={styles.titleLine}><h1>{client.name} · {workflowRun.project_name || "촬영 건"}</h1><span className={styles.count}>끝낸 것 {progress.done}/{progress.total}</span></div>
          <div className={styles.meta}><span>촬영 {workflowRun.shoot_date || "미정"}</span><span>담당 {workflowRun.manager_name || client.contact_name || "미정"}</span><span>{client.phone || "연락처 미등록"}</span></div>
          <p className={styles.next}>다음 할 일 · <span>{next?.nextActionLabel || "모든 할 일을 마쳤습니다"}</span></p>
        </div>
        <button className={styles.primary} type="button" onClick={handlePrimary} disabled={!next || Boolean(savingKey)}>{next ? next.actionLabel : "완료"}<ArrowRight size={16} /></button>
      </header>
      <div className={styles.layout}>
        <section className={styles.checklist} aria-label="촬영 건 체크리스트">
          {WORKFLOW_CHECK_GROUPS.map((group) => (
            <div className={styles.group} key={group}>
              <h2><ClipboardList size={15} /> {group}</h2>
              {WORKFLOW_CHECKS.filter((definition) => definition.group === group).map((definition) => {
                const state = checks[definition.key];
                const done = Boolean(state?.done);
                const isNext = next?.key === definition.key;
                return (
                  <div className={`${styles.row} ${isNext ? styles.rowNext : ""}`} key={definition.key}>
                    <div className={styles.label}>
                      {definition.actor === "user" ? <button type="button" aria-label={`${definition.label} ${done ? "완료 해제" : "완료"}`} className={`${styles.box} ${done ? styles.boxDone : ""}`} disabled={savingKey === definition.key} onClick={() => void toggle(definition.key, !done)}>{done ? <Check size={15} /> : null}</button> : <span className={`${styles.box} ${styles.boxAuto} ${done ? styles.boxDone : ""}`}>{done ? <Check size={15} /> : <LockKeyhole size={12} />}</span>}
                      <span className={styles.text}><strong>{definition.label}</strong><small>{state?.at ? `${dateLabel(state.at)} · ` : ""}{definition.evidence}{definition.actor === "auto" ? " · 자동 확인" : ""}</small></span>
                    </div>
                    <button type="button" className={styles.action} onClick={() => onOpenAction(definition)}>{definition.actionLabel}</button>
                  </div>
                );
              })}
            </div>
          ))}
          {customEntries.length ? <div className={styles.group}><h2><Plus size={15} /> 이 건에만 있는 할 일</h2>{customEntries.map(([key, state]) => <div className={styles.row} key={key}><div className={styles.label}><button type="button" className={`${styles.box} ${state.done ? styles.boxDone : ""}`} onClick={() => void toggle(key, !state.done)}>{state.done ? <Check size={15} /> : null}</button><span className={styles.text}><strong>{state.label}</strong><small>이 촬영 건에만 표시됩니다.</small></span></div><button className={styles.action} type="button" onClick={() => void save({ action: "remove_custom", key })}>삭제</button></div>)}</div> : null}
          <form className={styles.customForm} onSubmit={(event) => { event.preventDefault(); if (customLabel.trim()) void save({ action: "add_custom", label: customLabel.trim() }); }}><input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="이 건에만 있는 할 일" maxLength={80} /><button type="submit" disabled={!customLabel.trim() || Boolean(savingKey)}><Plus size={15} /> 추가</button></form>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
        <aside className={styles.side}>
          <section className={styles.sideCard}><h2><FileText size={15} /> 이 건의 문서</h2>{docs.map((doc) => <div className={`${styles.doc} ${doc.exists ? "" : styles.docMuted}`} key={doc.key}><span><strong>{doc.label}</strong><small>{doc.exists ? "준비됨" : doc.when}</small></span>{doc.key === "quote" || doc.key === "contract" || doc.key === "conti" ? <button type="button" onClick={() => onOpenTool(doc.key as ToolType)}>{doc.exists ? "보기" : "열기"}</button> : doc.exists ? <button type="button" onClick={() => window.open(doc.key === "original" ? client.original_photos_link : client.retouched_photos_link, "_blank", "noopener,noreferrer")}>보기</button> : null}</div>)}</section>
          <section className={styles.sideCard}><h2><UsersRound size={15} /> 고객이 보는 것</h2><div className={styles.chips}>{docs.map((doc) => <span key={doc.key} className={`${styles.chip} ${doc.exists ? "" : styles.chipLocked}`}>{doc.label}</span>)}</div><button type="button" className={styles.portalButton} onClick={onOpenPortal}><ExternalLink size={13} /> 고객 화면으로 보기</button></section>
          {reviewHandoff?.reviewId ? <section className={styles.sideCard}><h2>고객 피드백</h2><p>{reviewHandoff.reviewText || "고객 피드백이 도착했습니다."}</p><button type="button" className={styles.portalButton} onClick={() => window.open(reviewStudioHref, "_blank", "noopener,noreferrer")}>리뷰 콘텐츠 만들기</button></section> : null}
          <section className={`${styles.sideCard} ${styles.activity}`}><PcrmActivityTimeline activities={activities} variant="compact" /></section>
        </aside>
      </div>
    </div>
  );
}
