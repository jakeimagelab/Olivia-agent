"use client";

import { useEffect, useState } from "react";
import { CheckSquare2, FolderPlus, MoreHorizontal, X } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamProject } from "@/components/team-workspace/types";
import CreateTaskFromMessageDialog from "./CreateTaskFromMessageDialog";
import type { ChatMessage } from "./types";

export default function MessageActions({
  message,
  roomProjectId,
  onChanged,
}: {
  message: ChatMessage;
  roomProjectId?: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!projectOpen) return;
    fetch("/api/team/projects").then((response) => response.json()).then((data) => { if (data.ok) setProjects(data.projects); });
  }, [projectOpen]);
  if (message.metadata?.messageType === "task_event") return null;
  const connect = async (projectId: string) => {
    const response = await fetch(`/api/team-chat/rooms/${message.room_id}/messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const data = await response.json();
    if (!data.ok) { setError(data.error); return; }
    setProjectOpen(false); setOpen(false); onChanged();
  };
  return (
    <>
      <div style={{ position: "relative" }}>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-label="메시지 작업" style={{ width: 24, height: 24, border: 0, borderRadius: 7, background: open ? C.mint : "transparent", color: C.hint, display: "grid", placeItems: "center", cursor: "pointer" }}><MoreHorizontal size={15} /></button>
        {open ? <div style={{ position: "absolute", top: 26, right: 0, zIndex: 10, width: 150, padding: 6, borderRadius: 10, background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 12px 28px rgba(21,88,85,.13)" }}>
          <Action icon={<CheckSquare2 size={13} />} label="할 일로 만들기" onClick={() => { setTaskOpen(true); setOpen(false); }} />
          <Action icon={<FolderPlus size={13} />} label="프로젝트에 연결" onClick={() => setProjectOpen(true)} />
        </div> : null}
      </div>
      <CreateTaskFromMessageDialog message={message} projectId={roomProjectId ?? (message.metadata?.projectId as string | undefined)} open={taskOpen} onClose={() => setTaskOpen(false)} onCreated={() => { setTaskOpen(false); onChanged(); }} />
      {projectOpen ? <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(28,43,40,.3)", display: "grid", placeItems: "center", padding: 16 }}>
        <div className="team-card" style={{ width: "min(400px,100%)", padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 13 }}><b style={{ color: C.teal }}>프로젝트에 연결</b><button onClick={() => setProjectOpen(false)} style={{ border: 0, background: "transparent" }}><X size={18} /></button></div>
          {error ? <div className="team-error" style={{ marginBottom: 8 }}>{error}</div> : null}
          <div style={{ display: "grid", gap: 6 }}>{projects.map((project) => <button key={project.id} className="team-button secondary" onClick={() => connect(project.id)}>{project.name}</button>)}</div>
        </div>
      </div> : null}
    </>
  );
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 9px", border: 0, background: "transparent", borderRadius: 7, color: C.ink, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{icon}{label}</button>;
}
