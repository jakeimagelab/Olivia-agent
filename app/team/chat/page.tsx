import TeamChatShell from "@/components/team-chat/TeamChatShell";
import TeamWorkspaceShell from "@/components/team-workspace/TeamWorkspaceShell";

export default function TeamChatPage() {
  return <TeamWorkspaceShell title="팀채팅" fullBleed><TeamChatShell embedded /></TeamWorkspaceShell>;
}
