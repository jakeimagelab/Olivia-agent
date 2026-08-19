"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, FileText, ListChecks, Search, Sparkles } from "lucide-react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import WorkspaceMorphTransition from "@/components/workspace/WorkspaceMorphTransition";
import OliviaHomeContextDrawer from "@/components/home/OliviaHomeContextDrawer";
import OliviaCore from "@/components/olivia/OliviaCore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { TOOLS_WORK } from "@/lib/toolNav";
import Link from "next/link";
import { getWorkspaceLayoutWeight, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useHomeDashboardData } from "@/components/dashboard/HomeDashboardData";

const spring = { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.85 };
// UIUX 제안서 2차 목업의 "자주 쓰는 기능" 4칸 — lib/toolNav.ts(전역 기능 목록의 단일 소스)에서
// 그대로 골라 쓴다. 새 아이콘/설명을 새로 만들지 않고 기존 등록 정보를 재사용.
const QUICK_TOOL_TITLES = ["견적서 생성", "고객 관리", "셀렉 갤러리", "업무 캘린더"] as const;
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
  // 오늘 브리핑 한 줄 — 이미 불러와 둔 대시보드 데이터(useHomeDashboardData)에서 대기 건수를
  // 뽑아 그대로 보여준다. 새 API를 만들지 않고 기존 데이터만 재사용.
  const galleryPending = data?.clients?.galleryPending?.length ?? 0;
  const mailingPending = data?.mailing?.pending?.length ?? 0;
  const briefText = galleryPending > 0
    ? `셀렉 대기 ${galleryPending}건이 있어요. 리마인드 메일 보내드릴까요?`
    : mailingPending > 0
      ? `발송 대기 메일이 ${mailingPending}건 있어요. 확인해드릴까요?`
      : todayCount > 0
        ? `오늘 할 일이 ${todayCount}건 있어요.`
        : null;
  const quickTools = QUICK_TOOL_TITLES
    .map((title) => TOOLS_WORK.find((tool) => tool.title === title))
    .filter((tool): tool is (typeof TOOLS_WORK)[number] => Boolean(tool));

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
              <button className="olivia-agent-home__drawer-trigger" type="button" onClick={() => setDrawerOpen(true)} aria-label="오늘 할 일과 최근 작업 열기" aria-expanded={drawerOpen}>
                <ListChecks size={17} strokeWidth={1.7} /> 할 일 <strong>{todayCount}</strong><span>· 최근 작업</span>
              </button>
              <div className="olivia-home-greeting">
                <span className="olivia-home-greeting__badge"><Sparkles size={14} strokeWidth={1.7} /> AI가 함께하는 하루</span>
                <div className="olivia-home-greeting__title-row">
                  <OliviaCore isStreaming={isStreaming} size={30} />
                  <h1>안녕하세요, <em>정연호 대표님</em></h1>
                </div>
                <p>오늘도 스마트한 업무를 시작해볼까요?</p>
              </div>
              {briefText ? (
                <div className="olivia-home-brief">
                  <OliviaCore isStreaming={false} size={18} />
                  <span><strong>오늘 브리핑.</strong> {briefText}</span>
                </div>
              ) : null}
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

          {!isWorkspaceMode && quickTools.length ? (
            <div className="olivia-home-quick-tools" aria-label="자주 쓰는 기능">
              <span className="olivia-home-quick-tools__label">자주 쓰는 기능</span>
              <div className="olivia-home-quick-tools__grid">
                {quickTools.map(({ title, desc, href, icon: Icon }) => (
                  <Link key={title} href={href} className="olivia-home-quick-tools__card">
                    <Icon size={17} strokeWidth={1.7} />
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </Link>
                ))}
              </div>
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
