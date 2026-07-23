"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamMember } from "../types";

export default function NewProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState({ name: "", description: "", projectType: "internal", ownerId: "", startDate: "", dueDate: "", createChatRoom: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    fetch("/api/team-chat/members").then((response) => response.json()).then((data) => { if (data.ok) setMembers(data.members); });
  }, [open]);
  if (!open) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/team/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onCreated(); onClose();
      setForm({ name: "", description: "", projectType: "internal", ownerId: "", startDate: "", dueDate: "", createChatRoom: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로젝트 생성에 실패했습니다.");
    } finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(28,43,40,.35)", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="team-card" onSubmit={submit} style={{ width: "min(580px,100%)", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}><div><h2 style={{ margin: 0, color: C.teal, fontSize: 18 }}>새 프로젝트</h2><p style={{ margin: "5px 0 0", color: C.muted, fontSize: 11 }}>업무를 묶을 최소 정보만 입력하세요.</p></div><button type="button" onClick={onClose} style={{ border: 0, background: "transparent" }}><X size={20} /></button></div>
        <div style={{ display: "grid", gap: 13 }}>
          <div className="team-field"><label>프로젝트명</label><input className="team-input" required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="team-field"><label>설명</label><textarea className="team-textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <div className="team-grid-2">
            <div className="team-field"><label>유형</label><select className="team-select" value={form.projectType} onChange={(event) => setForm({ ...form, projectType: event.target.value })}><option value="photo">사진</option><option value="film">영상</option><option value="web">웹</option><option value="ai_system">AI 시스템</option><option value="branding">브랜딩</option><option value="marketing">마케팅</option><option value="internal">내부</option></select></div>
            <div className="team-field"><label>책임자</label><select className="team-select" value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}><option value="">선택 안 함</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></div>
          </div>
          <div className="team-grid-2"><div className="team-field"><label>시작일</label><input type="date" className="team-input" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div><div className="team-field"><label>마감일</label><input type="date" className="team-input" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div></div>
          <label style={{ display: "flex", gap: 8, fontSize: 12, color: C.muted }}><input type="checkbox" checked={form.createChatRoom} onChange={(event) => setForm({ ...form, createChatRoom: event.target.checked })} />프로젝트 채팅방 자동 생성</label>
          {error ? <div className="team-error">{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="team-button secondary" onClick={onClose}>취소</button><button type="submit" className="team-button" disabled={busy}>{busy ? "생성 중..." : "프로젝트 만들기"}</button></div>
        </div>
      </form>
    </div>
  );
}
