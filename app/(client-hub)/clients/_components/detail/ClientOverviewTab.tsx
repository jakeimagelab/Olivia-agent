"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ExternalLink, FileText, History, Images, Paintbrush, Settings, StickyNote } from "lucide-react";
import CurrentStepCard from "@/components/client-workspace/CurrentStepCard";
import { ACTIVE_WORKFLOW_STEPS, getWorkflowDisplayStepKey } from "@/lib/workflow";
import { resolveShootingSchedule } from "@/lib/clientWorkspace/projectOverview";
import { openWorkflowArtifact, type WorkflowArtifact, type WorkflowArtifactType } from "@/lib/workflowArtifacts";

type ToolType = "quote" | "contract" | "conti";

const DOCUMENTS: Array<{ type: ToolType; label: string; lockedLabel: string }> = [
  { type: "quote", label: "견적서", lockedLabel: "상담 후" },
  { type: "contract", label: "계약서", lockedLabel: "견적 확정 후" },
  { type: "conti", label: "촬영 콘티", lockedLabel: "계약 후" },
];

function dateAtMidnight(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(value?: string | null) {
  const date = dateAtMidnight(value);
  if (!date) return "날짜 미정";
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

function formatMonthDay(value?: string | null) {
  const date = dateAtMidnight(value);
  if (!date) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(value?: string | null) {
  const target = dateAtMidnight(value);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function contiDueDate(value?: string | null) {
  const date = dateAtMidnight(value);
  if (!date) return null;
  date.setDate(date.getDate() - 7);
  return localDateKey(date);
}

export default function ClientOverviewTab({
  client,
  workflowRun,
  artifacts,
  activities,
  quotes = [],
  contracts = [],
  resourceIds,
  stepIcon,
  stepDescription,
  onRefresh,
  onNavigateTab,
  onOpenToolModal,
  onOpenProjectSettings,
}: {
  client: any;
  workflowRun: any;
  artifacts: WorkflowArtifact[];
  activities: any[];
  quotes?: any[];
  contracts?: any[];
  resourceIds?: Partial<Record<ToolType, string | null>>;
  stepIcon?: string;
  stepDescription?: string;
  onRefresh: () => void;
  onNavigateTab?: (tab: string) => void;
  onOpenToolModal?: (type: ToolType) => void;
  onOpenProjectSettings?: () => void;
}) {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [memoDraft, setMemoDraft] = useState(client.memo || "");
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  const loadSchedule = useCallback(async () => {
    if (!client?.name) return;
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const res = await fetch(`/api/admin/pcrm/schedule?hospitalName=${encodeURIComponent(client.name)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "일정을 불러오지 못했습니다.");
      const today = localDateKey(new Date());
      setUpcoming((data.tasks || []).filter((task: any) => task.date >= today).sort((a: any, b: any) => a.date.localeCompare(b.date)));
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "일정을 불러오지 못했습니다.");
      setUpcoming([]);
    } finally {
      setScheduleLoading(false);
    }
  }, [client?.name]);

  useEffect(() => { void loadSchedule(); }, [loadSchedule]);
  useEffect(() => { setMemoDraft(client.memo || ""); }, [client.memo]);

  const currentStepKey = getWorkflowDisplayStepKey(workflowRun?.current_step_key) || workflowRun?.current_step_key || "consult_meeting";
  const currentStepIndex = ACTIVE_WORKFLOW_STEPS.findIndex((step) => step.key === currentStepKey);
  const shooting = useMemo(() => resolveShootingSchedule({
    shootDate: workflowRun?.shoot_date,
    tasks: upcoming,
    clientName: client?.name,
  }), [client?.name, upcoming, workflowRun?.shoot_date]);
  const shootDays = daysUntil(shooting.shootDate);
  const contiDeadline = contiDueDate(shooting.shootDate);

  const artifactByType = (type: WorkflowArtifactType) => artifacts.find((artifact) => artifact.document_type === type);
  const latestSourceDate = (type: ToolType) => {
    const artifact = artifactByType(type);
    if (artifact?.created_at) return artifact.created_at;
    if (type === "quote") return quotes[0]?.created_at;
    if (type === "contract") return contracts[0]?.created_at;
    return null;
  };
  const hasDocument = (type: ToolType) => Boolean(resourceIds?.[type] || artifactByType(type));
  const canCreateDocument = (type: ToolType) => {
    const stepIndex = ACTIVE_WORKFLOW_STEPS.findIndex((step) => step.key === type);
    return workflowRun?.status === "completed" || (stepIndex >= 0 && currentStepIndex >= stepIndex);
  };
  const openDocument = (type: ToolType) => {
    const artifact = artifactByType(type);
    if (artifact) {
      void openWorkflowArtifact(artifact.id, "view").catch((error) => alert(error instanceof Error ? error.message : "문서를 열지 못했습니다."));
      return;
    }
    onOpenToolModal?.(type);
  };

  const referenceType: ToolType | null = currentStepKey === "contract" ? "quote" : currentStepKey === "conti" ? "contract" : null;
  const secondaryAction = referenceType && hasDocument(referenceType)
    ? { label: `${DOCUMENTS.find((document) => document.type === referenceType)?.label} 보기`, onClick: () => openDocument(referenceType) }
    : undefined;

  const saveMemo = async () => {
    setMemoSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: memoDraft }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "저장 실패");
      setMemoEditing(false);
      onRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  };

  const registerShootDate = async () => {
    if (!shooting.shootDate) return;
    setCalendarSaving(true);
    setScheduleError("");
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: shooting.shootDate,
          title: `${client.name} 촬영`,
          memo: workflowRun?.project_name ? `${workflowRun.project_name} 촬영 일정` : "",
          category: "shooting",
          time: null,
          location: client.address || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "캘린더 등록에 실패했습니다.");
      await loadSchedule();
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "캘린더 등록에 실패했습니다.");
    } finally {
      setCalendarSaving(false);
    }
  };

  const quickLinks = [
    { key: "gallery", label: "갤러리", icon: Images, count: undefined, action: () => onNavigateTab?.("gallery") },
    { key: "schedule", label: "일정", icon: CalendarDays, count: upcoming.length || undefined, action: () => onNavigateTab?.("schedule") },
    { key: "revisions", label: "보정 요청", icon: Paintbrush, count: undefined, action: () => onNavigateTab?.("revisions") },
    { key: "activity", label: "활동 기록", icon: History, count: activities.length || undefined, action: () => onNavigateTab?.("activity") },
    { key: "portal", label: "고객 포털", icon: ExternalLink, count: undefined, action: () => onNavigateTab?.("portal") },
    { key: "settings", label: "프로젝트 설정", icon: Settings, count: undefined, action: onOpenProjectSettings },
  ];

  return (
    <div className="pcrm-project-overview">
      <div className="pcrm-project-overview__main">
        <CurrentStepCard
          client={client}
          workflowRun={workflowRun}
          stepIcon={stepIcon}
          stepDescription={stepDescription}
          onOpenToolModal={onOpenToolModal}
          onRefresh={onRefresh}
          presentation="overview"
          secondaryAction={secondaryAction}
        />

        <section className="pcrm-overview-documents" aria-labelledby="project-documents-title">
          <header>
            <h2 id="project-documents-title"><FileText size={15} /> 문서</h2>
            <button type="button" onClick={() => onNavigateTab?.("documents")}>전체 보기 →</button>
          </header>
          <div className="pcrm-overview-documents__list">
            {DOCUMENTS.map((document) => {
              const exists = hasDocument(document.type);
              const canCreate = canCreateDocument(document.type);
              const createdAt = latestSourceDate(document.type);
              return (
                <div key={document.type} className="pcrm-overview-document-row" data-state={exists ? "ready" : canCreate ? "create" : "locked"}>
                  <span className="pcrm-overview-document-row__name">{exists ? <Check size={13} /> : <FileText size={13} />}{document.label}</span>
                  {exists ? (
                    <>
                      <span className="pcrm-overview-document-row__status">{document.type === "quote" ? "확정" : "작성됨"}</span>
                      <time>{formatMonthDay(createdAt)}</time>
                      <button type="button" onClick={() => openDocument(document.type)}>보기</button>
                    </>
                  ) : canCreate ? (
                    <button type="button" className="pcrm-overview-document-row__create" onClick={() => onOpenToolModal?.(document.type)}>만들기</button>
                  ) : (
                    <span className="pcrm-overview-document-row__locked">{document.lockedLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="pcrm-project-overview__side">
        <section className="pcrm-shooting-summary">
          <header><h2>촬영까지</h2>{shooting.shootDate && <span>{shootDays === null ? "" : shootDays > 0 ? `${shootDays}일 뒤` : shootDays === 0 ? "오늘" : `${Math.abs(shootDays)}일 지남`}</span>}</header>
          {scheduleLoading ? <p className="pcrm-overview-muted">일정을 확인하고 있습니다.</p> : shooting.shootDate ? (
            <>
              <div className="pcrm-shooting-summary__date"><strong>{formatShortDate(shooting.shootDate)}</strong><span>촬영</span></div>
              {contiDeadline ? <div className="pcrm-shooting-summary__line"><span>콘티는 촬영 7일 전까지</span><time>{formatMonthDay(contiDeadline)}</time></div> : null}
               <div className="pcrm-shooting-summary__line">
                 <span>촬영 일정</span>
                 {shooting.needsCalendarRegistration ? <button type="button" onClick={registerShootDate} disabled={calendarSaving}>{calendarSaving ? "등록 중" : "캘린더에 등록"}</button> : <b><Check size={12} /> 캘린더 등록됨</b>}
               </div>
            </>
          ) : shooting.isEmpty ? (
            <p className="pcrm-overview-muted">예정된 일정이 없습니다.</p>
          ) : (
            <div className="pcrm-shooting-summary__date"><strong>{formatShortDate(upcoming[0]?.date)}</strong><span>{upcoming[0]?.title}</span></div>
          )}
          {scheduleError ? <p className="pcrm-overview-error">{scheduleError}</p> : null}
        </section>

        <section className="pcrm-overview-memo">
          <header><h2><StickyNote size={15} /> 메모</h2>{!memoEditing && <button type="button" onClick={() => setMemoEditing(true)}>＋ 작성</button>}</header>
          {memoEditing ? (
            <>
              <textarea value={memoDraft} onChange={(event) => setMemoDraft(event.target.value)} placeholder="상담 때 나온 이야기를 적어두세요." />
              <div className="pcrm-overview-memo__actions">
                <button type="button" onClick={() => { setMemoEditing(false); setMemoDraft(client.memo || ""); }}>취소</button>
                <button type="button" onClick={saveMemo} disabled={memoSaving}>{memoSaving ? "저장 중" : "저장"}</button>
              </div>
            </>
          ) : <p>{client.memo || "상담 때 나온 이야기를 적어두면 콘티를 만들 때 같이 볼 수 있습니다."}</p>}
        </section>

        <nav className="pcrm-overview-links" aria-label="고객 프로젝트 바로가기">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return <button key={link.key} type="button" onClick={link.action}><Icon size={14} /><span>{link.label}</span>{link.count ? <b>{link.count}</b> : null}</button>;
          })}
        </nav>
      </aside>
    </div>
  );
}
