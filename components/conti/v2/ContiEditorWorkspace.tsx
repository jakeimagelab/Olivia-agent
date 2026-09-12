"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Download, FileSpreadsheet, History, Redo2, Save, Share2, Tablet, Undo2, Users, X } from "lucide-react";
import ContiCompactChecklist from "@/components/conti/v2/ContiCompactChecklist";
import ContiCompactSchedule from "@/components/conti/v2/ContiCompactSchedule";
import ContiPreviousDrawer from "@/components/conti/v2/ContiPreviousDrawer";
import ContiResultTable from "@/components/conti/v2/ContiResultTable";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import styles from "@/components/conti/v2/ContiV2.module.css";

interface ClientOption { id: string; name: string }

export default function ContiEditorWorkspace({ controller, clientId, workflowRunId, onBack, onOpenField, onOpenRun, onPublished }: {
  controller: ContiStudioController;
  clientId?: string;
  workflowRunId?: string;
  onBack: () => void;
  onOpenField: () => void;
  onOpenRun: (runId: string) => void;
  onPublished?: () => void;
}) {
  const [previousOpen, setPreviousOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [completeState, setCompleteState] = useState<"idle" | "completing" | "done" | "error">("idle");
  const [completeError, setCompleteError] = useState("");
  const document = controller.document;

  useEffect(() => {
    if (!linkOpen || clients.length) return;
    fetch("/api/clients").then((response) => response.json()).then((body) => {
      if (body.ok) setClients((body.clients ?? []).map((client: { id: string; hospital_name?: string }) => ({ id: client.id, name: client.hospital_name || "(이름 없음)" })));
    }).catch(() => {});
  }, [clients.length, linkOpen]);

  const totalMinutes = useMemo(() => document?.scenes.reduce((sum, scene) => sum + (scene.minutes ?? 0), 0) ?? 0, [document]);
  if (!document) return null;
  const activeDocument = document;

  const linked = Boolean(activeDocument.run.hospital_id);
  const title = activeDocument.run.hospital_name?.trim() || `${specialtyLabel(activeDocument.run.specialty)} 촬영 콘티`;

  async function saveCanonical(chosenClientId?: string) {
    const targetClientId = chosenClientId || clientId || activeDocument.run.hospital_id || "";
    if (!targetClientId) { setLinkOpen(true); return; }
    setSavingLink(true);
    const draftSaved = await controller.flushSave();
    const linkedSuccessfully = draftSaved && await controller.linkCanonicalConti(targetClientId, workflowRunId || activeDocument.run.workflow_run_id || undefined);
    setSavingLink(false);
    if (linkedSuccessfully) { setLinkOpen(false); onPublished?.(); }
  }

  async function createShareLink(audience: "customer" | "staff") {
    setShareOpen(false); setShareStatus("링크 생성 중…");
    try {
      const response = await fetch(`/api/conti/runs/${activeDocument.run.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "공유 링크 생성에 실패했습니다.");
      const url = `${window.location.origin}/conti/share/${body.token}`;
      await navigator.clipboard.writeText(url);
      setShareStatus(`${audience === "staff" ? "현장팀용" : "고객용"} 링크 복사됨`);
    } catch (caught) { setShareStatus(caught instanceof Error ? caught.message : "공유 링크 생성에 실패했습니다."); }
    setTimeout(() => setShareStatus(""), 3500);
  }

  async function downloadExcel() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const contiRows = activeDocument.scenes.map((scene, index) => ({
      "#": index + 1,
      "구분": activeDocument.groups.find((group) => group.id === scene.group_id)?.name || "미지정",
      "Scene": scene.name,
      "세부내용 / 촬영포인트": scene.description,
      "인원": scene.people_text,
      "장소": scene.space_text,
      "구도": activeDocument.studioState.sceneMeta[scene.id]?.cameraAngle || "",
      "준비사항": scene.preparation_text,
      "예상시간(분)": scene.minutes ?? "",
      "비고": scene.note,
      "상태": scene.completed ? "완료" : "대기",
    }));
    const checklistRows = controller.checklist.map((item, index) => ({ "#": index + 1, "준비사항": item.label, "연결 Scene": item.linkedSceneIds.length, "완료": item.completed ? "완료" : "대기", "메모": item.notes || "" }));
    const scheduleRows = controller.schedule.map((row) => ({ "#": row.order, "시간": row.startTime && row.endTime ? `${row.startTime}-${row.endTime}` : "", "Scene": row.name, "장소": row.location, "소요시간(분)": row.minutes }));
    const sheets = [
      ["콘티", contiRows, [5, 13, 20, 42, 17, 18, 16, 28, 13, 20, 10]],
      ["준비사항", checklistRows, [5, 28, 14, 10, 26]],
      ["촬영스케줄", scheduleRows, [5, 16, 24, 20, 14]],
    ] as const;
    for (const [name, rows, widths] of sheets) {
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
    XLSX.writeFile(workbook, `${sanitizeFilename(title)}.xlsx`);
  }

  async function completeWorkflowStep() {
    const activeWorkflowRunId = workflowRunId || activeDocument.run.workflow_run_id || "";
    if (!activeWorkflowRunId) return;
    setCompleteState("completing"); setCompleteError("");
    try {
      if (!await controller.flushSave()) throw new Error("먼저 콘티 저장을 완료해 주세요.");
      if (activeDocument.run.workflow_run_id !== activeWorkflowRunId) {
        if (!await controller.linkCanonicalConti(activeDocument.run.hospital_id || undefined, activeWorkflowRunId)) throw new Error("프로젝트 연결에 실패했습니다.");
      }
      const response = await fetch(`/api/workflow-runs/${activeWorkflowRunId}/complete-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey: "conti" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "최종완료 처리에 실패했습니다.");
      setCompleteState("done");
      onPublished?.();
    } catch (caught) {
      setCompleteError(caught instanceof Error ? caught.message : "최종완료 처리에 실패했습니다.");
      setCompleteState("error");
    }
  }

  return (
    <div className={styles.editorWorkspace}>
      <header className={styles.editorHeader}>
        <div className={styles.editorTitleBlock}>
          <button type="button" className={styles.iconButton} onClick={onBack} aria-label="입력 화면으로"><ArrowLeft size={17} /></button>
          <div><span>{linked ? "고객관리 연결됨" : "DRAFT"}</span><h2>{title}</h2><small>{document.scenes.length} Scene · {formatMinutes(totalMinutes)}</small></div>
        </div>
        <div className={styles.editorActions}>
          <SaveState status={controller.saveStatus} lastSavedAt={controller.lastSavedAt} onRetry={() => void controller.flushSave()} />
          <button type="button" className={styles.secondaryAction} onClick={() => void downloadExcel()}><FileSpreadsheet size={14} />Excel</button>
          <button type="button" className={styles.secondaryAction} onClick={() => window.print()}><Download size={14} />PDF</button>
          <div className={styles.actionMenu}>
            <button type="button" className={styles.secondaryAction} onClick={() => setShareOpen((value) => !value)}><Share2 size={14} />공유<ChevronDown size={12} /></button>
            {shareOpen ? <div className={styles.actionPopover}><button type="button" onClick={() => void createShareLink("customer")}><Share2 size={13} />고객용 링크</button><button type="button" onClick={() => void createShareLink("staff")}><Users size={13} />현장팀용 링크</button></div> : null}
          </div>
          <button type="button" className={styles.secondaryAction} onClick={onOpenField}><Tablet size={14} />현장뷰</button>
          <button type="button" className={styles.primarySaveAction} disabled={savingLink} onClick={() => void saveCanonical()}><Save size={14} />{savingLink ? "저장 중…" : "저장하기"}</button>
          {(workflowRunId || activeDocument.run.workflow_run_id) ? <button type="button" className={`${styles.secondaryAction} ${completeState === "done" ? styles.completeActionDone : ""}`} disabled={completeState === "completing" || completeState === "done"} onClick={() => void completeWorkflowStep()}><CheckCircle2 size={14} />{completeState === "completing" ? "완료 처리 중…" : completeState === "done" ? "최종완료됨" : completeState === "error" ? "다시 완료" : "최종완료"}</button> : null}
        </div>
      </header>

      <div className={styles.editorToolbar}>
        <div><button type="button" disabled={!controller.canUndo} onClick={controller.undo}><Undo2 size={15} />실행 취소</button><button type="button" disabled={!controller.canRedo} onClick={controller.redo}><Redo2 size={15} />다시 실행</button></div>
        <div><button type="button" onClick={() => setPreviousOpen(true)}><History size={15} />이전 콘티</button>{shareStatus ? <span role="status">{shareStatus}</span> : null}</div>
      </div>

      {controller.error || completeError ? <div className={styles.workspaceError} role="alert">{completeError || controller.error}<button type="button" onClick={completeError ? () => void completeWorkflowStep() : () => void controller.flushSave()}>다시 시도</button></div> : null}
      <ContiResultTable controller={controller} />
      <div className={styles.compactGrid}>
        <ContiCompactChecklist items={controller.checklist} onToggle={controller.toggleChecklistItem} onAdd={controller.addChecklistItem} />
        <ContiCompactSchedule rows={controller.schedule} startTime={document.studioState.scheduleStartTime} onStartTimeChange={controller.setScheduleStartTime} />
      </div>

      <ContiPreviousDrawer open={previousOpen} onClose={() => setPreviousOpen(false)} onOpen={(runId) => { setPreviousOpen(false); onOpenRun(runId); }} />
      {linkOpen ? <div className={styles.linkDialogBackdrop}><section className={styles.linkDialog} role="dialog" aria-modal="true" aria-label="고객 연결"><header><div><span>CANONICAL SAVE</span><h3>고객과 연결하기</h3></div><button type="button" onClick={() => setLinkOpen(false)} aria-label="닫기"><X size={17} /></button></header><p>저장할 고객을 선택하면 현재 콘티가 고객관리에서 바로 열립니다.</p><select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}><option value="">고객을 선택해 주세요</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><button type="button" className={styles.primarySaveAction} disabled={!selectedClientId || savingLink} onClick={() => void saveCanonical(selectedClientId)}><Check size={14} />{savingLink ? "연결 중…" : "연결하고 저장"}</button></section></div> : null}
    </div>
  );
}

function SaveState({ status, lastSavedAt, onRetry }: { status: ContiStudioController["saveStatus"]; lastSavedAt: Date | null; onRetry: () => void }) {
  const content = status === "saving" ? "저장 중…" : status === "dirty" ? "변경사항 저장 대기" : status === "failed" ? "저장 실패" : status === "saved" ? `자동저장됨${lastSavedAt ? " · 방금 전" : ""}` : "자동저장 준비됨";
  return <button type="button" className={`${styles.saveState} ${status === "failed" ? styles.saveStateFailed : ""}`} onClick={status === "failed" ? onRetry : undefined}><span />{content}</button>;
}

function specialtyLabel(value?: string | null) {
  const labels: Record<string, string> = { dermatology: "피부과", orthopedics: "정형외과", ophthalmology: "안과", "plastic-surgery": "성형외과", rehabilitation: "재활의학과", dental: "치과", internal: "내과", pediatrics: "소아과", gynecology: "산부인과" };
  return value ? labels[value] || value : "촬영";
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`; }
function sanitizeFilename(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "촬영 콘티"; }
