"use client";

import { useEffect, useMemo, useState } from "react";
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

// 시간대/업무량에 따라 인사말이 "유기적으로" 바뀌게 — 같은 상황이어도 매번 똑같은 문장이면
// 금방 질리니 상황별로 2~3개 후보를 두고 날짜 기준으로 하나를 고른다(하루 안에서는 고정,
// 날짜가 바뀌면 자연스럽게 다른 문장으로). 일정이 많은 날/처리할 일이 쌓인 날은 시간대 인사보다
// 그 사실을 먼저 알려주는 쪽이 더 쓸모 있어서 우선순위를 앞에 둔다.
const GREETING_VARIANTS = {
  busy: ["오늘은 일정이 많은 날이에요", "할 일이 가득한 하루예요", "바쁜 하루가 될 것 같아요"],
  pending: ["확인할 업무가 쌓여 있어요", "처리할 일들이 기다리고 있어요"],
  dawn: ["늦은 시간까지 고생 많으세요", "오늘도 늦게까지 애쓰고 계시네요"],
  morning: ["안녕하세요, 좋은 아침입니다", "상쾌한 아침이에요", "오늘도 활기찬 아침이에요"],
  afternoon: ["오늘도 좋은 오후예요", "활기찬 오후 보내고 계신가요", "오늘 하루도 순조롭길 바라요"],
  evening: ["오늘 하루도 고생하셨어요", "오늘도 수고 많으셨어요"],
  night: ["늦은 시간까지 고생 많으세요", "오늘도 늦게까지 애쓰셨어요"],
} as const;

function pickVariant(list: readonly string[], seed: number) {
  return list[((seed % list.length) + list.length) % list.length];
}

function getHomeGreetingTitle(now: Date, todayCount: number, pendingCount: number) {
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const hour = now.getHours();
  if (todayCount >= 4) return pickVariant(GREETING_VARIANTS.busy, dayOfYear);
  if (pendingCount >= 3) return pickVariant(GREETING_VARIANTS.pending, dayOfYear);
  if (hour < 5) return pickVariant(GREETING_VARIANTS.dawn, dayOfYear);
  if (hour < 12) return pickVariant(GREETING_VARIANTS.morning, dayOfYear);
  if (hour < 18) return pickVariant(GREETING_VARIANTS.afternoon, dayOfYear);
  if (hour < 22) return pickVariant(GREETING_VARIANTS.evening, dayOfYear);
  return pickVariant(GREETING_VARIANTS.night, dayOfYear);
}

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
  // 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지하려고 null로 시작 — 마운트 후에만 실제
  // 시각을 채운다(hydration mismatch 방지, TodayAlertBanner와 동일한 패턴).
  const [now, setNow] = useState<Date | null>(null);
  const hasWorkspace = useWorkspaceStore((state) => state.type !== null);
  // 실제 워크스페이스가 열리기 전, 도구가 그걸 열 것으로 보이면(pendingWorkspaceOpen) 결과가
  // 오기 전에도 미리 패널을 펼쳐서 스켈레톤을 보여준다(Phase 4) — mode는 OPEN_WORKSPACE가 와야
  // "workspace"로 바뀌므로 건드리지 않는다.
  const isWorkspaceMode = (hasWorkspace && (mode === "workspace" || mode === "workspace-chat-expanded" || mode === "fullscreen")) || (pendingWorkspaceOpen && !hasWorkspace);
  const weights = getWorkspaceLayoutWeight({ mode, chatFocused, workspaceFocused, streaming: isStreaming });
  const todayCount = data?.todayTasks.length ?? 0;
  const pendingCount =
    (data?.mailing?.pending?.length ?? 0) +
    (data?.clients?.galleryPending?.length ?? 0) +
    (data?.clients?.reviewPending?.length ?? 0) +
    (data?.clients?.contractPending?.length ?? 0);
  const greetingTitle = useMemo(
    () => (now ? getHomeGreetingTitle(now, todayCount, pendingCount) : "안녕하세요"),
    [now, todayCount, pendingCount],
  );

  useEffect(() => { setNow(new Date()); }, []);

  useEffect(() => {
    if (hasWorkspace && (mode === "idle" || mode === "conversation")) openWorkspaceMode();
  }, [hasWorkspace, mode, openWorkspaceMode]);

  useEffect(() => {
    if (isWorkspaceMode) setDrawerOpen(false);
  }, [isWorkspaceMode]);

  // mode는 OPEN_WORKSPACE가 실제로 도착해야 "workspace"로 바뀐다(위 주석 참고) — 그런데
  // .olivia-adaptive-stage.is-workspace 선택자가 좌우(row-reverse) 레이아웃을 담당해서,
  // pendingWorkspaceOpen만 켜진 스켈레톤 단계(isWorkspaceMode는 이미 true)에서는 바깥
  // 컨테이너가 여전히 is-idle/is-conversation이라 기본값(flex-direction: column, 위/아래
  // 분할)으로 보였다(2026-08-30 사용자 리포트). isWorkspaceMode가 true면 mode 값과 무관하게
  // is-workspace를 추가로 붙여 스켈레톤이 뜨는 순간부터 바로 좌우 레이아웃이 되게 한다.
  return (
    <main className={`olivia-adaptive-stage olivia-agent-home is-${mode}${isWorkspaceMode ? " is-workspace" : ""}`} data-layout-mode={mode}>
      <motion.div className={`olivia-agent-home__row${isWorkspaceMode ? " is-workspace" : ""}`} layout transition={spring} style={isWorkspaceMode ? { flexGrow: weights.chat } : undefined}>
        <section className="olivia-agent-home__main">
          {!isWorkspaceMode ? (
            <>
              <button className="olivia-agent-home__drawer-trigger" type="button" onClick={() => setDrawerOpen(true)} aria-label="오늘 할 일과 최근 작업 열기" aria-expanded={drawerOpen}>
                <ListChecks size={17} strokeWidth={1.7} /> 할 일 <strong>{todayCount}</strong><span>· 최근 작업</span>
              </button>
              <div className="olivia-home-greeting">
                <div className="olivia-home-greeting__intro">
                  <div className={`olivia-home-orb${isStreaming ? " is-thinking" : ""}`} aria-hidden="true">
                    <img className="olivia-home-orb__logo" src="/assets/photoclinic-mark.png" alt="" />
                  </div>
                  <p className="olivia-home-greeting__brand">Photoclinic Olivia</p>
                </div>
                <h1>{greetingTitle}</h1>
                <p>오늘도 스마트한 업무를 시작해볼까요?</p>
              </div>
            </>
          ) : null}

          {/* 홈 진입 모션(로고 등장 → 채팅창 오픈)은 OliviaSplash가 전담한다 — 여기서는
              내부 페이지 이동마다 반복되면 안 되니 별도 mount-in 애니메이션을 걸지 않는다. */}
          <motion.section layout transition={spring} className="olivia-adaptive-stage__chat">
            <div className="olivia-home-entry__chat-core">
              <OliviaConversation variant={isWorkspaceMode ? "workspace" : "home"} showExpandToggle={isWorkspaceMode} />
            </div>
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
