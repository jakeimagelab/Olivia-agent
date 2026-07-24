"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Paperclip, X } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamTask } from "../types";
import TaskChecklist from "./TaskChecklist";
import TaskStatusBadge from "./TaskStatusBadge";

export default function TaskDetailDrawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [task, setTask] = useState<TeamTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/team/tasks/${taskId}`, { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setTask(data.task);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "업무를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!taskId) return null;

  const action = async (name: string) => {
    if (busy || !task) return;
    let body: Record<string, string> | undefined;
    if (name === "request-revision") {
      const revisionNote = window.prompt("수정 요청 내용을 입력해주세요.");
      if (!revisionNote) return;
      body = { revisionNote };
    }
    const previousTask = task;
    const nextStatus = name === "start" || name === "request-revision" || name === "reopen" ? "in_progress"
      : name === "submit" ? "review"
      : name === "approve" ? "completed"
      : name === "hold" ? "on_hold"
      : task.status;
    setTask({
      ...task,
      status: nextStatus,
      revision_note: name === "request-revision" ? body?.revisionNote ?? task.revision_note : task.revision_note,
    });
    setBusy(name);
    setError("");
    try {
      const response = await fetch(`/api/team/tasks/${task.id}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onChanged();
      void load();
    } catch (actionError) {
      setTask(previousTask);
      setError(actionError instanceof Error ? actionError.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !task || busy) return;
    setBusy("upload");
    setError("");
    try {
      const sessionResponse = await fetch(`/api/team/tasks/${task.id}/attachments/upload-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size }),
      });
      const sessionData = await sessionResponse.json();
      if (!sessionData.ok) throw new Error(sessionData.error);
      const uploadResponse = await fetch(sessionData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Drive 업로드에 실패했습니다.");
      const driveFile = await uploadResponse.json();
      const recordResponse = await fetch(`/api/team/tasks/${task.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: driveFile.id, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const recordData = await recordResponse.json();
      if (!recordData.ok) throw new Error(recordData.error);
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "첨부에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };
  const toggleChecklist = async (item: NonNullable<TeamTask["checklists"]>[number]) => {
    if (!task || busy) return;
    setBusy(`checklist-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/team/tasks/${task.id}/checklists/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      await load();
    } catch (checklistError) {
      setError(checklistError instanceof Error ? checklistError.message : "체크리스트 변경에 실패했습니다.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <button type="button" onClick={onClose} aria-label="업무 닫기" style={{ position: "fixed", inset: 0, zIndex: 60, border: 0, background: "rgba(28,43,40,.2)" }} />
      <aside style={{ position: "fixed", zIndex: 61, top: 0, right: 0, height: "100vh", width: "min(520px,100%)", background: "#fff", boxShadow: "-20px 0 50px rgba(28,43,40,.12)", overflowY: "auto" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, height: 60, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,.95)", borderBottom: `1px solid ${C.border}` }}>
          <b style={{ color: C.teal, fontSize: 14 }}>업무 상세</b>
          <button type="button" onClick={onClose} style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        {loading && !task ? <div style={{ padding: 24, color: C.muted }}>불러오는 중...</div> : task ? (
          <div style={{ padding: 22, display: "grid", gap: 22 }}>
            <section>
              <TaskStatusBadge status={task.status} />
              <h2 style={{ fontSize: 22, color: C.ink, margin: "11px 0 8px" }}>{task.title}</h2>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{task.description || "설명이 없습니다."}</p>
            </section>
            {task.revision_note ? <div className="team-error" style={{ background: "#fff7ed", color: C.orange }}>수정 요청: {task.revision_note}</div> : null}
            <section className="team-card" style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Info label="프로젝트" value={task.project?.name ?? "없음"} />
              <Info label="담당자" value={task.assignee?.display_name ?? "없음"} />
              <Info label="우선순위" value={task.priority} />
              <Info label="기간" value={`${task.start_date ?? "-"} ~ ${task.due_date ?? "-"}`} />
            </section>
            <section><h3 style={sectionTitle}>체크리스트</h3><TaskChecklist items={task.checklists ?? []} onToggle={toggleChecklist} disabled={Boolean(busy)} /></section>
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h3 style={{ ...sectionTitle, margin: 0 }}>결과물 첨부</h3>
                <label className="team-button secondary" style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}><Paperclip size={13} />{busy === "upload" ? "업로드 중" : "파일 추가"}<input type="file" hidden disabled={Boolean(busy)} onChange={(event) => upload(event.target.files?.[0] ?? null)} /></label>
              </div>
              {(task.attachments ?? []).length ? <div style={{ display: "grid", gap: 7 }}>{task.attachments!.map((attachment) => <a key={attachment.id} href={`https://drive.google.com/file/d/${attachment.drive_file_id}/view`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, display: "flex", gap: 7, alignItems: "center" }}><ExternalLink size={13} />{attachment.file_name}</a>)}</div> : <div className="team-empty">첨부된 결과물이 없습니다.</div>}
            </section>
            {task.sourceMessage ? <section><h3 style={sectionTitle}>원본 채팅 메시지</h3><div style={{ borderRadius: 12, padding: 13, background: C.mint, color: C.ink, fontSize: 12, whiteSpace: "pre-wrap" }}>{(task as any).sourceMessage.body}</div></section> : null}
            <section><h3 style={sectionTitle}>변경 이력</h3>{(task.events ?? []).length ? <div style={{ display: "grid", gap: 9 }}>{task.events!.map((event) => <div key={event.id} style={{ fontSize: 11, color: C.muted, borderLeft: `2px solid ${C.border}`, paddingLeft: 10 }}><b style={{ color: C.ink }}>{event.actor?.display_name ?? "시스템"}</b> · {event.event_type}<br /><span>{new Date(event.created_at).toLocaleString("ko-KR")}</span>{event.note ? <div>{event.note}</div> : null}</div>)}</div> : <div className="team-empty">변경 이력이 없습니다.</div>}</section>
            {error ? <div className="team-error">{error}</div> : null}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", position: "sticky", bottom: 0, background: "#fff", padding: "12px 0" }}>
              {task.status === "todo" ? <ActionButton name="start" label="시작하기" busy={busy} onAction={action} /> : null}
              {task.status === "in_progress" ? <><ActionButton name="submit" label="확인 요청" busy={busy} onAction={action} orange /><ActionButton name="hold" label="보류" busy={busy} onAction={action} secondary /></> : null}
              {task.status === "review" ? <><ActionButton name="approve" label="승인" busy={busy} onAction={action} /><ActionButton name="request-revision" label="수정 요청" busy={busy} onAction={action} orange /></> : null}
              {["completed", "on_hold"].includes(task.status) ? <ActionButton name="reopen" label="다시 열기" busy={busy} onAction={action} secondary /> : null}
            </div>
          </div>
        ) : <div className="team-error" style={{ margin: 20 }}>{error || "업무를 찾을 수 없습니다."}</div>}
      </aside>
    </>
  );
}

const sectionTitle = { fontSize: 13, color: C.teal, margin: "0 0 10px" } as const;
function Info({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 10, color: C.hint, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 12, color: C.ink, fontWeight: 800 }}>{value}</div></div>;
}
function ActionButton({ name, label, busy, onAction, orange, secondary }: { name: string; label: string; busy: string; onAction: (name: string) => void; orange?: boolean; secondary?: boolean }) {
  return <button type="button" className={`team-button${orange ? " orange" : secondary ? " secondary" : ""}`} disabled={Boolean(busy)} onClick={() => onAction(name)}>{busy === name ? "처리 중..." : label}</button>;
}
