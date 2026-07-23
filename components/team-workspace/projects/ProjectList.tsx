"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { TeamProject } from "../types";
import { useTeamRealtime } from "../useTeamRealtime";
import NewProjectDialog from "./NewProjectDialog";
import ProjectCard from "./ProjectCard";

export default function ProjectList() {
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/team/projects", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setProjects(data.projects); setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "프로젝트를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useTeamRealtime(["team_projects", "team_tasks"], load);
  return (
    <>
      <div className="team-page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}><div><h2>프로젝트</h2><p>진행률은 완료 업무 비율로 자동 계산됩니다.</p></div><button className="team-button" onClick={() => setNewOpen(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> 새 프로젝트</button></div>
      {error ? <div className="team-error">{error}</div> : null}
      {loading ? <div className="team-empty">프로젝트를 불러오는 중...</div> : projects.length ? <div className="team-grid-3">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : <div className="team-empty">진행 중인 프로젝트가 없습니다.</div>}
      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
    </>
  );
}
