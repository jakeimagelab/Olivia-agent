"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import WorkspaceMorphTransition from "@/components/workspace/WorkspaceMorphTransition";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentWork from "@/components/dashboard/RecentWork";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import IntegratedCalendar from "@/components/dashboard/IntegratedCalendar";
import HomeMissionBar from "@/components/dashboard/HomeMissionBar";
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
  const resetToIdle = useOliviaLayoutStore((state) => state.resetToIdle);
  const startConversation = useOliviaLayoutStore((state) => state.startConversation);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const pendingWorkspaceOpen = useOliviaConversationStore((state) => state.pendingWorkspaceOpen);
  const agentStatus = useOliviaConversationStore((state) => state.agentStatus);
  const { data } = useHomeDashboardData();
  const hasWorkspace = useWorkspaceStore((state) => state.type !== null);
  // 실제 워크스페이스가 열리기 전, 도구가 그걸 열 것으로 보이면(pendingWorkspaceOpen) 결과가
  // 오기 전에도 미리 패널을 펼쳐서 스켈레톤을 보여준다(Phase 4) — mode는 OPEN_WORKSPACE가 와야
  // "workspace"로 바뀌므로 건드리지 않는다.
  const isWorkspaceMode = (hasWorkspace && (mode === "workspace" || mode === "workspace-chat-expanded" || mode === "fullscreen")) || (pendingWorkspaceOpen && !hasWorkspace);
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

      {!isWorkspaceMode ? <HomeMissionBar /> : null}

      <motion.section
        layout
        transition={spring}
        aria-hidden={mode !== "idle" && mode !== "conversation"}
        className={`olivia-home-context${mode === "conversation" ? " is-dock" : ""}${isWorkspaceMode ? " is-hidden" : ""}`}
      >
        <div className="olivia-home-context__expanded">
          {/* 펼친 상태를 다시 접는 버튼 — 빠른실행/최근 프로젝트/오늘 일정 dock 버튼의 반대 동작
              (startConversation이 resetToIdle의 역방향: idle → conversation). */}
          <button type="button" className="olivia-home-context__collapse" onClick={startConversation} aria-label="패널 접기" title="패널 접기">
            <ChevronDown size={14} />
          </button>
          <QuickActions /><RecentWork /><SmartSuggestions /><IntegratedCalendar />
        </div>
        <div className="olivia-context-dock">
          {/* 채팅 중엔 빠른 실행/최근 프로젝트/오늘 일정 패널이 이 요약 버튼들로 접힌다(is-dock,
              admin.css) — 클릭하면 채팅을 유지한 채로 패널을 다시 펼친다(resetToIdle). */}
          <button type="button" onClick={resetToIdle}>⚡ 빠른 실행 <strong>4</strong></button>
          <button type="button" onClick={resetToIdle}>최근 프로젝트</button>
          <button type="button" onClick={resetToIdle}>오늘 일정 <strong>{todayCount}</strong></button>
        </div>
      </motion.section>

      <motion.section
        layout
        transition={spring}
        className={`olivia-adaptive-stage__workspace${isWorkspaceMode ? " is-visible" : ""}`}
        style={{ flexGrow: isWorkspaceMode ? weights.workspace : 0, position: "relative" }}
        onPointerDown={() => setWorkspaceFocused(true)}
        onPointerLeave={() => setTimeout(() => setWorkspaceFocused(false), 450)}
      >
        <WorkspaceMorphTransition hasWorkspace={hasWorkspace} pendingWorkspaceOpen={pendingWorkspaceOpen} pendingLabel={agentStatus} />
      </motion.section>
    </main>
  );
}
