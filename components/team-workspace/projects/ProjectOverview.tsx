"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/theme";
import type { TeamProject, TeamTask } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import TaskDetailDrawer from "../tasks/TaskDetailDrawer";
import ProjectMembers from "./ProjectMembers";
import ProjectTaskList from "./ProjectTaskList";

export default function ProjectOverview({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ project: TeamProject; members: any[]; tasks: TeamTask[]; room: any; recentEvents: any[] } | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/team/projects/${projectId}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error);
      setData(json); setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "프로젝트를 불러오지 못했습니다."); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["team_projects", "team_tasks"], load);
  if (error && !data) return <div className="team-error">{error}</div>;
  if (!data) return <div className="team-empty">프로젝트를 불러오는 중...</div>;
  const { project } = data;
  return (
    <>
      <div className="team-page-heading"><Link href="/team/projects" style={{ color: C.muted, fontSize: 11 }}>← 프로젝트</Link><h2 style={{ marginTop: 10 }}>{project.name}</h2><p>{project.description || "프로젝트 설명이 없습니다."}</p></div>
      <div className="team-grid-3" style={{ marginBottom: 16 }}>
        <div className="team-card" style={{ padding: 18 }}><small style={{ color: C.muted }}>진행률</small><div style={{ fontSize: 32, color: C.teal, fontWeight: 900, marginTop: 7 }}>{project.progress}%</div></div>
        <div className="team-card" style={{ padding: 18 }}><small style={{ color: C.muted }}>상태</small><div style={{ fontSize: 18, fontWeight: 900, marginTop: 12 }}>{project.status}</div></div>
        <div className="team-card" style={{ padding: 18 }}><small style={{ color: C.muted }}>마감일</small><div style={{ fontSize: 18, fontWeight: 900, marginTop: 12 }}>{project.due_date ?? "-"}</div></div>
      </div>
      <div className="team-grid-2" style={{ alignItems: "start" }}>
        <section className="team-card"><div className="team-card-header"><h3>담당자 및 멤버</h3></div><div className="team-card-body"><ProjectMembers members={data.members} /></div></section>
        <section className="team-card"><div className="team-card-header"><h3>연결 채팅방</h3></div><div className="team-card-body">{data.room ? <Link href={`/team/chat?room=${data.room.id}`} style={{ color: C.teal, fontWeight: 800, fontSize: 12 }}>{data.room.name} 채팅방 열기</Link> : <div className="team-empty">연결된 채팅방이 없습니다.</div>}</div></section>
      </div>
      <div style={{ height: 16 }} />
      <section className="team-card"><div className="team-card-header"><h3>전체 업무</h3><span style={{ fontSize: 11 }}>{data.tasks.length}건</span></div><div className="team-card-body"><ProjectTaskList tasks={data.tasks} onOpen={setSelectedId} /></div></section>
      <div style={{ height: 16 }} />
      <section className="team-card"><div className="team-card-header"><h3>최근 활동</h3></div><div className="team-card-body">{data.recentEvents.length ? data.recentEvents.map((event) => <div key={event.id} style={{ padding: "8px 0", fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{event.team_tasks?.title} · {event.event_type} · {new Date(event.created_at).toLocaleString("ko-KR")}</div>) : <div className="team-empty">최근 활동이 없습니다.</div>}</div></section>
      <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </>
  );
}
