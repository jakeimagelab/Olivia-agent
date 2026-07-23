import TeamWorkspaceShell from "@/components/team-workspace/TeamWorkspaceShell";
import ProjectOverview from "@/components/team-workspace/projects/ProjectOverview";

export default async function TeamProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <TeamWorkspaceShell title="프로젝트 상세"><ProjectOverview projectId={projectId} /></TeamWorkspaceShell>;
}
