import TeamWorkspaceShell from "@/components/team-workspace/TeamWorkspaceShell";
import TaskListPage from "@/components/team-workspace/tasks/TaskListPage";

export default function TeamTasksPage() {
  return <TeamWorkspaceShell title="할 일"><TaskListPage /></TeamWorkspaceShell>;
}
