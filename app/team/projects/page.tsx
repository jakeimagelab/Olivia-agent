import TeamWorkspaceShell from "@/components/team-workspace/TeamWorkspaceShell";
import ProjectList from "@/components/team-workspace/projects/ProjectList";

export default function TeamProjectsPage() {
  return <TeamWorkspaceShell title="프로젝트"><ProjectList /></TeamWorkspaceShell>;
}
