"use client";

import dynamic from "next/dynamic";
import { CheckSquare2, MessageCircle } from "lucide-react";
import { useState } from "react";
import GlobalHeader from "@/components/GlobalHeader";
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
    const nextTab: WorkspaceTab = key === "chat" ? "chat" : "tasks";
    setActiveTab(nextTab);
    setLinkedTaskId(null);
    window.history.replaceState({ ...window.history.state }, "", `/team?tab=${nextTab}`);
  };

  return (
    <TeamWorkspaceShell>
      <GlobalHeader title="워크스페이스" description="팀 채팅·목표·프로젝트·리포트를 한 곳에서 관리합니다." />
      <div className="pc-tabs pc-tabs--global">
        {[
          { key: "tasks", label: "할 일", icon: <CheckSquare2 size={15} /> },
          { key: "chat", label: "팀채팅", icon: <MessageCircle size={15} /> },
        ].map((t) => (
          <button
            key={t.key}
            className={`pc-tab${activeTab === t.key ? " pc-tab--active" : ""}`}
            onClick={() => changeTab(t.key)}
          >
            <span className="pc-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

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
