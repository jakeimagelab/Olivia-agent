"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentProjects from "@/components/dashboard/RecentProjects";
import IntegratedCalendar from "@/components/dashboard/IntegratedCalendar";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { getWorkspaceLayoutWeight, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

const spring = { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.85 };

export default function OliviaAdaptiveStage() {
  const mode = useOliviaLayoutStore((state) => state.mode);
  const chatFocused = useOliviaLayoutStore((state) => state.chatFocused);
  const workspaceFocused = useOliviaLayoutStore((state) => state.workspaceFocused);
  const setWorkspaceFocused = useOliviaLayoutStore((state) => state.setWorkspaceFocused);
  const openWorkspaceMode = useOliviaLayoutStore((state) => state.openWorkspaceMode);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const { data } = useHomeDashboardData();
  const hasWorkspace = useWorkspaceStore((state) => state.type !== null);
  const isWorkspaceMode = hasWorkspace && (mode === "workspace" || mode === "workspace-chat-expanded" || mode === "fullscreen");
  const weights = getWorkspaceLayoutWeight({ mode, chatFocused, workspaceFocused, streaming: isStreaming });
  const todayCount = data?.todayTasks.length ?? 0;

  useEffect(() => {
    if (hasWorkspace && (mode === "idle" || mode === "conversation")) openWorkspaceMode();
  }, [hasWorkspace, mode, openWorkspaceMode]);

  return (
    <main className={`olivia-adaptive-stage is-${mode}`} data-layout-mode={mode}>
      <motion.section
        layout
        transition={spring}
        className="olivia-adaptive-stage__chat"
        style={{ flexGrow: isWorkspaceMode ? weights.chat : 1 }}
      >
        <OliviaConversation variant={isWorkspaceMode ? "workspace" : "main"} showExpandToggle={isWorkspaceMode} />
      </motion.section>

      <motion.section
        layout
        transition={spring}
        aria-hidden={mode !== "idle" && mode !== "conversation"}
        className={`olivia-home-context${mode === "conversation" ? " is-dock" : ""}${isWorkspaceMode ? " is-hidden" : ""}`}
      >
        <div className="olivia-home-context__expanded"><QuickActions /><RecentProjects /><IntegratedCalendar /></div>
        <div className="olivia-context-dock">
          <button type="button">⚡ 빠른 실행 <strong>4</strong></button>
          <button type="button">최근 프로젝트</button>
          <button type="button">오늘 일정 <strong>{todayCount}</strong></button>
        </div>
      </motion.section>

      <motion.section
        layout
        transition={spring}
        className={`olivia-adaptive-stage__workspace${isWorkspaceMode ? " is-visible" : ""}`}
        style={{ flexGrow: isWorkspaceMode ? weights.workspace : 0 }}
        onPointerDown={() => setWorkspaceFocused(true)}
        onPointerLeave={() => setTimeout(() => setWorkspaceFocused(false), 450)}
      >
        <DynamicWorkspace />
      </motion.section>
    </main>
  );
}
