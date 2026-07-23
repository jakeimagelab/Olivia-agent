import TeamWorkspaceShell from "@/components/team-workspace/TeamWorkspaceShell";
import TodayDashboard from "@/components/team-workspace/today/TodayDashboard";

export default function TeamTodayPage() {
  return <TeamWorkspaceShell title="오늘"><TodayDashboard /></TeamWorkspaceShell>;
}
