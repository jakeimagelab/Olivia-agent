"use client";

import dynamic from "next/dynamic";
import { CheckSquare2, MessageCircle } from "lucide-react";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import TeamWorkspaceShell from "./TeamWorkspaceShell";

type WorkspaceTab = "chat" | "tasks";

const TeamChatShell = dynamic(() => import("@/components/team-chat/TeamChatShell"), {
  loading: () => <div className="team-empty">팀채팅을 불러오는 중...</div>,
});

const TaskListPage = dynamic(() => import("./tasks/TaskListPage"), {
  loading: () => <div className="team-empty">할 일을 불러오는 중...</div>,
});

export default function WorkspacePage({
  initialTab,
  initialTaskId,
}: {
  initialTab: WorkspaceTab;
  initialTaskId?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [linkedTaskId, setLinkedTaskId] = useState(initialTaskId);

  const changeTab = (key: string) => {
    const nextTab: WorkspaceTab = key === "tasks" ? "tasks" : "chat";
    setActiveTab(nextTab);
    setLinkedTaskId(null);
    window.history.replaceState({ ...window.history.state }, "", `/team?tab=${nextTab}`);
  };

  return (
    <TeamWorkspaceShell>
      <PageHeader
        title="워크스페이스"
        tabs={[
          { key: "chat", label: "팀채팅", icon: <MessageCircle size={15} /> },
          { key: "tasks", label: "할 일", icon: <CheckSquare2 size={15} /> },
        ]}
        activeTab={activeTab}
        onTabChange={changeTab}
      />

      <div className="workspace-content">
        {activeTab === "chat" ? (
          <div className="workspace-chat-panel">
            <TeamChatShell embedded />
          </div>
        ) : (
          <TaskListPage initialTaskId={linkedTaskId} />
        )}
      </div>
    </TeamWorkspaceShell>
  );
}
