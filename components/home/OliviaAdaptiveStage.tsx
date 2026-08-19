"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, FileText, ListChecks, Search, Sparkles } from "lucide-react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import WorkspaceMorphTransition from "@/components/workspace/WorkspaceMorphTransition";
import OliviaHomeContextDrawer from "@/components/home/OliviaHomeContextDrawer";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { getWorkspaceLayoutWeight, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

const spring = { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.85 };
const QUICK_PROMPTS = [
  { title: "업무 요청하기", description: "작업을 Olivia에게 맡기기", icon: Sparkles, prompt: "새 업무를 요청하고 싶어요. 필요한 내용을 물어봐줘." },
  { title: "정보 찾아보기", description: "필요한 정보 빠르게 찾기", icon: Search, prompt: "업무에 필요한 정보를 찾고 싶어요. 무엇을 찾을지 물어봐줘." },
  { title: "보고서 생성", description: "데이터 기반 보고서 만들기", icon: FileText, prompt: "보고서를 만들고 싶어요. 어떤 정보가 필요한지 물어봐줘." },
  { title: "일정 확인", description: "오늘의 일정 한눈에 보기", icon: CalendarDays, prompt: "오늘 일정과 해야 할 일을 정리해줘." },
] as const;

export default function OliviaAdaptiveStage() {
  const mode = useOliviaLayoutStore((state) => state.mode);
  const chatFocused = useOliviaLayoutStore((state) => state.chatFocused);
  const workspaceFocused = useOliviaLayoutStore((state) => state.workspaceFocused);
  const setWorkspaceFocused = useOliviaLayoutStore((state) => state.setWorkspaceFocused);
  const openWorkspaceMode = useOliviaLayoutStore((state) => state.openWorkspaceMode);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const sendMessage = useOliviaConversationStore((state) => state.sendMessage);
  const pendingWorkspaceOpen = useOliviaConversationStore((state) => state.pendingWorkspaceOpen);
  const agentStatus = useOliviaConversationStore((state) => state.agentStatus);
  const { data } = useHomeDashboardData();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  useEffect(() => {
    if (isWorkspaceMode) setDrawerOpen(false);
  }, [isWorkspaceMode]);

  return (
    <main className={`olivia-adaptive-stage olivia-agent-home is-${mode}`} data-layout-mode={mode}>
      <motion.div className={`olivia-agent-home__row${isWorkspaceMode ? " is-workspace" : ""}`} layout transition={spring} style={isWorkspaceMode ? { flexGrow: weights.chat } : undefined}>
        <section className="olivia-agent-home__main">
          {!isWorkspaceMode ? (
            <>
              <button className="olivia-agent-home__drawer-trigger" type="button" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
                <ListChecks size={17} strokeWidth={1.7} /> 할 일 <strong>{todayCount}</strong><span>· 최근 작업</span>
              </button>
              <div className="olivia-home-greeting">
                <span className="olivia-home-greeting__badge"><Sparkles size={14} strokeWidth={1.7} /> AI가 함께하는 하루</span>
                <h1>안녕하세요, <em>정연호 대표님</em></h1>
                <p>오늘도 스마트한 업무를 시작해볼까요?</p>
              </div>
            </>
          ) : null}

          <motion.section layout transition={spring} className="olivia-adaptive-stage__chat">
            <OliviaConversation variant={isWorkspaceMode ? "workspace" : "home"} showExpandToggle={isWorkspaceMode} />
          </motion.section>

          {!isWorkspaceMode ? (
            <div className="olivia-agent-quick-actions" aria-label="Olivia 빠른 요청">
              {QUICK_PROMPTS.map(({ title, description, icon: Icon, prompt }) => (
                <button key={title} type="button" disabled={isSending} onClick={() => void sendMessage(prompt)}>
                  <span><Icon size={19} strokeWidth={1.6} /></span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <AnimatePresence initial={false}>
          {!isWorkspaceMode && drawerOpen ? (
            <motion.div
              key="home-context-drawer"
              className="olivia-agent-home__drawer-slot"
              initial={{ width: 0, opacity: 0, x: 20 }}
              animate={{ width: 350, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 20 }}
              transition={{ duration: .22, ease: [.32, .72, 0, 1] }}
            >
              <OliviaHomeContextDrawer onClose={() => setDrawerOpen(false)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

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
