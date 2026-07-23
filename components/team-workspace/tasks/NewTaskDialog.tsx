"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamMember, TeamProject } from "../types";

export type NewTaskDefaults = {
  title?: string;
  description?: string;
  roomId?: string;
  sourceMessageId?: string;
  projectId?: string;
};

export default function NewTaskDialog({
  open,
  onClose,
  onCreated,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (task: any) => void;
  defaults?: NewTaskDefaults;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [form, setForm] = useState({ title: "", description: "", assigneeId: "", projectId: "", dueDate: "", priority: "normal" });
  const [checklistText, setChecklistText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setForm({
      title: defaults?.title ?? "",
      description: defaults?.description ?? "",
      assigneeId: "",
      projectId: defaults?.projectId ?? "",
      dueDate: "",
      priority: "normal",
    });
    setChecklistText("");
    Promise.all([
      fetch("/api/team-chat/members").then((response) => response.json()),
      fetch("/api/team/projects").then((response) => response.json()),
    ]).then(([memberData, projectData]) => {
      if (memberData.ok) setMembers(memberData.members);
      if (projectData.ok) setProjects(projectData.projects);
    });
  }, [open, defaults]);
  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          checklist: checklistText.split("\n").map((item) => item.trim()).filter(Boolean),
          roomId: defaults?.roomId || null,
          sourceMessageId: defaults?.sourceMessageId || null,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onCreated(data.task);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "업무 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(28,43,40,.35)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="team-card" style={{ width: "min(560px,100%)", maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div><h2 style={{ fontSize: 18, color: C.teal, margin: 0 }}>새 할 일</h2><p style={{ fontSize: 11, color: C.muted, margin: "5px 0 0" }}>오늘 바로 실행할 수 있게 핵심만 작성하세요.</p></div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ display: "grid", gap: 13 }}>
          <div className="team-field"><label>업무 제목</label><input className="team-input" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
          <div className="team-field"><label>설명</label><textarea className="team-textarea" maxLength={10000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <div className="team-field"><label>체크리스트 · 한 줄에 하나</label><textarea className="team-textarea" value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder={"자료 확인\n1차 시안 제작\n최종 파일 정리"} /></div>
          <div className="team-grid-2">
            <div className="team-field"><label>담당자</label><select className="team-select" value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}><option value="">담당자 없음</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></div>
            <div className="team-field"><label>프로젝트</label><select className="team-select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">프로젝트 없음</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
          </div>
          <div className="team-grid-2">
            <div className="team-field"><label>마감일</label><input className="team-input" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div>
            <div className="team-field"><label>우선순위</label><select className="team-select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option><option value="urgent">긴급</option></select></div>
          </div>
          {error ? <div className="team-error">{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="team-button secondary" onClick={onClose}>취소</button><button type="submit" className="team-button" disabled={busy}>{busy ? "생성 중..." : "할 일 만들기"}</button></div>
        </div>
      </form>
    </div>
  );
}
