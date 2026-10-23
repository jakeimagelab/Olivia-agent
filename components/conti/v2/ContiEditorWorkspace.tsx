"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Download, FileSpreadsheet, History, Plus, Redo2, Save, Share2, Tablet, Undo2, Users, X } from "lucide-react";
import ContiCompactChecklist from "@/components/conti/v2/ContiCompactChecklist";
import ContiPreviousDrawer from "@/components/conti/v2/ContiPreviousDrawer";
import ContiPrintDocument from "@/components/conti/v2/ContiPrintDocument";
import ContiResultTable from "@/components/conti/v2/ContiResultTable";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import styles from "@/components/conti/v2/ContiV2.module.css";
import { useCoreProjectSnapshot } from "@/lib/core/client/useCoreProjectSnapshot";
import { notifyCoreSnapshotUpdated } from "@/lib/core/client/projectSnapshotEvents";
import { isContiCoreCompleted } from "@/lib/core/readModels/projectViewState";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import { getDepartmentContiTitle } from "@/lib/conti/departmentTaxonomy";
import { summarizeScheduleSegments } from "@/lib/conti/deriveSchedule";
import { buildContiExportModel } from "@/lib/conti/exportModel";
import { downloadContiExcel } from "@/lib/conti/excel";

interface ClientOption { id: string; name: string }

export default function ContiEditorWorkspace({ controller, clientId, workflowRunId, notices = [], onBack, onOpenField, onOpenRun, onPublished }: {
  controller: ContiStudioController;
  clientId?: string;
  workflowRunId?: string;
  notices?: string[];
  onBack: () => void;
  onOpenField: () => void;
  onOpenRun: (runId: string) => void;
  onPublished?: () => void;
}) {
  const isDesktopWindow = useDesktopWindowMode();
  const [previousOpen, setPreviousOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [completeState, setCompleteState] = useState<"idle" | "completing" | "done" | "error">("idle");
  const [completeError, setCompleteError] = useState("");
  const [editorTab, setEditorTab] = useState<"conti" | "checklist" | "schedule">("conti");
  const [hospitalEditedAt, setHospitalEditedAt] = useState<string | null>(null);
  const document = controller.document;
  const activeWorkflowRunId = workflowRunId || document?.run.workflow_run_id || undefined;
  const activeContiId = document?.run.id;
  const activeClientId = document?.run.hospital_id || clientId || undefined;
  const activeClientName = document?.run.hospital_name || undefined;
  const {
    snapshot: coreSnapshot,
    refresh: refreshCoreSnapshot,
  } = useCoreProjectSnapshot(activeWorkflowRunId);
  const contiCoreCompleted = Boolean(
    activeContiId
    && coreSnapshot
    && isContiCoreCompleted(coreSnapshot, activeContiId),
  );
  const setOliviaCurrentDocument = useOliviaContextStore((state) => state.setCurrentDocument);
  const setOliviaPageContext = useOliviaContextStore((state) => state.setPageContext);

  useEffect(() => {
    if (!activeContiId) return;
    setOliviaCurrentDocument(
      activeContiId,
      "conti",
      `${activeClientName || "고객"} 촬영 콘티`,
      {
        clientId: activeClientId,
        clientName: activeClientName,
        projectId: activeWorkflowRunId,
        projectName: activeClientName,
      },
    );
    setOliviaPageContext({
      pageMode: "edit",
      capabilities: [
        "conti.edit",
        "conti.add_scene",
        "conti.reorder_scene",
        "conti.remove_scene",
        "conti.complete",
        "conti.publish",
      ],
      documentStatus: contiCoreCompleted ? "final" : "draft",
      canEdit: !contiCoreCompleted,
      canComplete: !contiCoreCompleted,
      canPublish: true,
      canFinalize: !contiCoreCompleted,
    });
  }, [activeClientId, activeClientName, activeContiId, activeWorkflowRunId, contiCoreCompleted, setOliviaCurrentDocument, setOliviaPageContext]);

  useEffect(() => {
    if (!linkOpen || clients.length) return;
    fetch("/api/clients").then((response) => response.json()).then((body) => {
      if (body.ok) setClients((body.clients ?? []).map((client: { id: string; hospital_name?: string }) => ({ id: client.id, name: client.hospital_name || "(이름 없음)" })));
    }).catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
  }, [clients.length, linkOpen]);

  useEffect(() => {
    if (!activeContiId) return;
    fetch(`/api/conti/runs/${activeContiId}/share`, { cache: "no-store" }).then((response) => response.json()).then((body) => {
      if (body.ok) setHospitalEditedAt(body.editedAt ?? null);
    }).catch(() => undefined);
  }, [activeContiId]);

  const totalMinutes = useMemo(() => controller.schedule.reduce((sum, row) => sum + row.minutes, 0), [controller.schedule]);
  if (!document) return null;
  const activeDocument = document;

  const linked = Boolean(activeDocument.run.hospital_id);
  const title = activeDocument.run.hospital_name?.trim() || getDepartmentContiTitle(activeDocument.run.specialty || "촬영");
  const exportModel = buildContiExportModel({ title, document: activeDocument, checklist: controller.checklist, schedule: controller.schedule });

  async function saveCanonical(chosenClientId?: string) {
    const targetClientId = chosenClientId || clientId || activeDocument.run.hospital_id || "";
    if (!targetClientId) { setLinkOpen(true); return; }
    setSavingLink(true);
    const draftSaved = await controller.flushSave();
    const linkedSuccessfully = draftSaved && await controller.linkCanonicalConti(targetClientId, workflowRunId || activeDocument.run.workflow_run_id || undefined);
    setSavingLink(false);
    if (linkedSuccessfully) { setLinkOpen(false); onPublished?.(); }
  }

  async function createShareLink(audience: "customer" | "staff" | "hospital") {
    setShareOpen(false); setShareStatus("링크 생성 중…");
    try {
      const response = await fetch(`/api/conti/runs/${activeDocument.run.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "공유 링크 생성에 실패했습니다.");
      const url = `${window.location.origin}/conti/share/${body.token}`;
      await navigator.clipboard.writeText(url);
      setShareStatus(`${audience === "staff" ? "현장팀용" : audience === "hospital" ? "병원 작성용" : "고객용"} 링크 복사됨`);
    } catch (caught) { setShareStatus(caught instanceof Error ? caught.message : "공유 링크 생성에 실패했습니다."); }
    setTimeout(() => setShareStatus(""), 3500);
  }

  async function downloadExcel() {
    if (!await controller.flushSave()) return;
    await downloadContiExcel(exportModel, `${sanitizeFilename(title)}.xlsx`);
  }

  async function printPdf() {
    if (!await controller.flushSave()) return;
    window.print();
  }

  async function completeWorkflowStep() {
    if (!activeWorkflowRunId) return;
    setCompleteState("completing"); setCompleteError("");
    try {
      if (!await controller.flushSave()) throw new Error("먼저 콘티 저장을 완료해 주세요.");
      if (activeDocument.run.workflow_run_id !== activeWorkflowRunId) {
        if (!await controller.linkCanonicalConti(activeDocument.run.hospital_id || undefined, activeWorkflowRunId)) throw new Error("프로젝트 연결에 실패했습니다.");
      }
      const response = await fetch(`/api/conti/runs/${activeDocument.run.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowRunId: activeWorkflowRunId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "최종완료 처리에 실패했습니다.");
      setCompleteState("done");
      await refreshCoreSnapshot();
      notifyCoreSnapshotUpdated(activeWorkflowRunId);
      onPublished?.();
    } catch (caught) {
      setCompleteError(caught instanceof Error ? caught.message : "최종완료 처리에 실패했습니다.");
      setCompleteState("error");
    }
  }

  return (
    <div className={styles.editorWorkspace}>
      <header className={styles.editorHeader}>
        {isDesktopWindow ? null : (
          <div className={styles.editorTitleBlock}>
            <button type="button" className={styles.iconButton} onClick={onBack} aria-label="입력 화면으로"><ArrowLeft size={17} /></button>
            <div><span>{linked ? "고객관리 연결됨" : "DRAFT"}</span><h2>{title}</h2><small>{document.scenes.length} Scene · {formatMinutes(totalMinutes)}</small></div>
          </div>
        )}
        <div className={styles.editorActions}>
          <SaveState status={controller.saveStatus} error={controller.error} lastSavedAt={controller.lastSavedAt} onRetry={() => void controller.flushSave()} />
          <button type="button" className={styles.secondaryAction} onClick={() => void downloadExcel()}><FileSpreadsheet size={14} />Excel</button>
          <button type="button" className={styles.secondaryAction} onClick={() => void printPdf()}><Download size={14} />PDF</button>
          <div className={styles.actionMenu}>
            <button type="button" className={styles.secondaryAction} onClick={() => setShareOpen((value) => !value)}><Share2 size={14} />공유<ChevronDown size={12} /></button>
            {shareOpen ? <div className={styles.actionPopover}><button type="button" onClick={() => void createShareLink("customer")}><Share2 size={13} />고객용 링크</button><button type="button" onClick={() => void createShareLink("staff")}><Users size={13} />현장팀용 링크</button><button type="button" onClick={() => void createShareLink("hospital")}><CalendarDays size={13} />병원 작성용 링크</button></div> : null}
          </div>
          <button type="button" className={styles.secondaryAction} onClick={onOpenField}><Tablet size={14} />현장뷰</button>
          <button type="button" className={styles.primarySaveAction} disabled={savingLink} onClick={() => void saveCanonical()}><Save size={14} />{savingLink ? "저장 중…" : "저장하기"}</button>
          {activeWorkflowRunId ? <button type="button" className={`${styles.secondaryAction} ${contiCoreCompleted || completeState === "done" ? styles.completeActionDone : ""}`} disabled={completeState === "completing" || contiCoreCompleted} onClick={() => void completeWorkflowStep()}><CheckCircle2 size={14} />{contiCoreCompleted ? "✓ 최종완료됨" : completeState === "completing" ? "완료 처리 중…" : completeState === "done" ? "✓ 최종완료됨" : completeState === "error" ? "다시 완료" : "최종완료"}</button> : null}
        </div>
      </header>

      <div className={styles.editorToolbar}>
        <div><button type="button" disabled={!controller.canUndo} onClick={controller.undo}><Undo2 size={15} />실행 취소</button><button type="button" disabled={!controller.canRedo} onClick={controller.redo}><Redo2 size={15} />다시 실행</button></div>
        <div>{hospitalEditedAt ? <span className={styles.hospitalEditedNotice}>병원이 {relativeMinutes(hospitalEditedAt)} 전에 수정했습니다. <button type="button" onClick={() => void controller.reload()}>새로고침</button></span> : null}<button type="button" onClick={() => setPreviousOpen(true)}><History size={15} />이전 콘티</button>{shareStatus ? <span role="status">{shareStatus}</span> : null}</div>
      </div>

      <nav className={styles.editorTabs} aria-label="콘티 편집 메뉴">
        {([['conti', '콘티'], ['checklist', '준비사항'], ['schedule', '타임테이블']] as const).map(([value, label]) => <button key={value} type="button" aria-current={editorTab === value ? "page" : undefined} onClick={() => setEditorTab(value)}>{label}</button>)}
        <button type="button" onClick={onOpenField}>현장뷰</button>
      </nav>

      {notices.length ? <div className={styles.creationNotices} role="status">{notices.map((notice) => <p key={notice}>{notice}</p>)}</div> : null}
      {controller.error || completeError ? <div className={styles.workspaceError} role="alert"><span>{completeError || controller.error}<small>{completeError ? "서버 메시지를 확인한 뒤 완료 조건을 고치고 다시 시도해주세요." : "서버 메시지를 확인한 뒤 입력 내용을 고치고 다시 저장해주세요."}</small></span><button type="button" onClick={completeError ? () => void completeWorkflowStep() : () => void controller.flushSave()}>다시 시도</button></div> : null}
      {editorTab === "conti" ? <ContiResultTable controller={controller} /> : null}
      {editorTab === "checklist" ? <div className={styles.singleEditorPanel}><ContiCompactChecklist items={controller.checklist} onToggle={controller.toggleChecklistItem} onAdd={controller.addChecklistItem} assignees={document.studioState.checklistAssignees} onAssigneeChange={controller.setChecklistAssignee} /></div> : null}
      {editorTab === "schedule" ? <ScheduleEditor controller={controller} /> : null}

      <ContiPrintDocument model={exportModel} />

      <ContiPreviousDrawer open={previousOpen} onClose={() => setPreviousOpen(false)} onOpen={(runId) => { setPreviousOpen(false); onOpenRun(runId); }} />
      {linkOpen ? <div className={styles.linkDialogBackdrop}><section className={styles.linkDialog} role="dialog" aria-modal="true" aria-label="고객 연결"><header><div><span>CANONICAL SAVE</span><h3>고객과 연결하기</h3></div><button type="button" onClick={() => setLinkOpen(false)} aria-label="닫기"><X size={17} /></button></header><p>저장할 고객을 선택하면 현재 콘티가 고객관리에서 바로 열립니다.</p><select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}><option value="">고객을 선택해 주세요</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><button type="button" className={styles.primarySaveAction} disabled={!selectedClientId || savingLink} onClick={() => void saveCanonical(selectedClientId)}><Check size={14} />{savingLink ? "연결 중…" : "연결하고 저장"}</button></section></div> : null}
    </div>
  );
}

function ScheduleEditor({ controller }: { controller: ContiStudioController }) {
  const document = controller.document;
  if (!document) return null;
  const state = document.studioState;
  const summaries = summarizeScheduleSegments(controller.schedule, state.scheduleSegments);

  function patchSegment(id: string, patch: Record<string, string | undefined>) {
    controller.updateStudioState((current) => ({
      ...current,
      scheduleSegments: current.scheduleSegments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment),
    }));
  }

  function addSegment() {
    controller.updateStudioState((current) => ({
      ...current,
      scheduleSegments: [...current.scheduleSegments, { id: crypto.randomUUID(), label: `${current.scheduleSegments.length + 1}일차`, startTime: "09:00", endTime: "18:00" }],
    }));
  }

  function addBreak(segmentId: string) {
    controller.updateStudioState((current) => ({
      ...current,
      scheduleBlocks: [...current.scheduleBlocks, { id: crypto.randomUUID(), segmentId, type: "break", label: "점심시간", minutes: 60, startTime: "12:00" }],
    }));
  }

  return <section className={styles.scheduleEditor}>
    <header><div><span>타임테이블</span><h3>촬영 구간과 고정 일정을 정합니다.</h3></div><button type="button" onClick={addSegment}><Plus size={14} />날짜 구간 추가</button></header>
    <div className={styles.segmentControls}>{state.scheduleSegments.map((segment) => {
      const summary = summaries.find((item) => item.segmentId === segment.id);
      return <article key={segment.id}>
        <div className={styles.segmentFields}>
          <input aria-label="구간 이름" value={segment.label} onChange={(event) => patchSegment(segment.id, { label: event.target.value })} />
          <input aria-label={`${segment.label} 날짜`} type="date" value={segment.date || ""} onChange={(event) => patchSegment(segment.id, { date: event.target.value || undefined })} />
          <label>시작<input type="time" value={segment.startTime || ""} onChange={(event) => patchSegment(segment.id, { startTime: event.target.value || undefined })} /></label>
          <label>종료<input type="time" value={segment.endTime || ""} onChange={(event) => patchSegment(segment.id, { endTime: event.target.value || undefined })} /></label>
          <button type="button" onClick={() => addBreak(segment.id)}><Clock3 size={13} />휴식 추가</button>
        </div>
        {summary ? <p className={summary.warning ? styles.scheduleWarning : undefined}>사용 {summary.usedMinutes}분 · 여유 {summary.remainingMinutes}분{summary.warning ? " — 여유 시간이 없습니다." : ""}</p> : null}
      </article>;
    })}</div>
    <div className={styles.timelineTable}>
      <div className={styles.timelineHead}><span>날짜</span><span>순서</span><span>시작</span><span>종료</span><span>분</span><span>장면</span><span>담당·인물</span><span>장소</span><span>고정</span></div>
      {controller.schedule.map((row) => <div key={row.rowId} className={row.locked ? styles.timelineLocked : undefined}>
        <span><input aria-label={`${row.name} 날짜`} type="date" value={row.date || ""} onChange={(event) => controller.updateTimelineOverride(row.rowId, { date: event.target.value || null })} /></span><span>{row.order}</span><span><input aria-label={`${row.name} 시작 시각`} type="time" value={row.startTime || ""} onChange={(event) => controller.updateTimelineOverride(row.rowId, { startTime: event.target.value || null })} /></span><span><input aria-label={`${row.name} 종료 시각`} type="time" value={row.endTime || ""} onChange={(event) => controller.updateTimelineOverride(row.rowId, { endTime: event.target.value || null })} /></span><span>{row.minutes}</span><strong>{row.name}{row.type === "doctor" ? <small>{row.steps?.map((step) => step.name).join(" · ")}</small> : null}</strong><span>{row.doctorName || row.people || "-"}</span><span>{row.location}</span>
        <label className={styles.fixedTimeControl}><input type="checkbox" checked={Boolean(state.fixedSceneTimes[row.sceneId]) || row.type === "break"} disabled={row.type === "break" || row.type === "doctor"} onChange={(event) => controller.updateStudioState((current) => {
          const next = { ...current.fixedSceneTimes };
          if (event.target.checked && row.startTime && row.segmentId) next[row.sceneId] = { segmentId: row.segmentId, startTime: row.startTime };
          else delete next[row.sceneId];
          return { ...current, fixedSceneTimes: next };
        })} /><span>{row.type === "doctor" ? "개인 전개" : row.locked ? "잠금" : "고정"}</span></label>
      </div>)}
    </div>
  </section>;
}

function SaveState({ status, error, lastSavedAt, onRetry }: { status: ContiStudioController["saveStatus"]; error: string; lastSavedAt: Date | null; onRetry: () => void }) {
  const content = status === "saving" ? "저장 중…" : status === "dirty" ? "변경사항 저장 대기" : status === "failed" ? `저장 실패 — ${error || "서버가 사유를 보내지 않았습니다."}` : status === "saved" ? `자동저장됨${lastSavedAt ? " · 방금 전" : ""}` : "자동저장 준비됨";
  return <button type="button" className={`${styles.saveState} ${status === "failed" ? styles.saveStateFailed : ""}`} onClick={status === "failed" ? onRetry : undefined}><span />{content}{status === "failed" ? <small>입력 내용을 고친 뒤 다시 저장</small> : null}</button>;
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`; }
function relativeMinutes(value: string) { return `${Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))}분`; }
function sanitizeFilename(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "촬영 콘티"; }
