"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import OliviaChatDock from "@/components/olivia/OliviaChatDock";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { useOliviaChatModeStore, OLIVIA_CHAT_MODE_WIDTH } from "@/lib/store/useOliviaChatModeStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { registerOliviaRouter } from "@/lib/olivia/features/navigationBridge";
import { oliviaMotion, prefersReducedMotion } from "@/lib/motion/presets";

// 코드 요청서 — Olivia UX/Motion Core(2026-08-16). 예전 GlobalOliviaChat.tsx를 대체한다 —
// 닫힌 채로 시작하는 오버레이 드로어(OliviaFloatingConversation) 대신, 항상 폭을 차지하는
// 패널로 렌더링하고 최소화만 가능하게 한다(display:none 금지, 섹션 6/65).
// 홈(/admin/dashboard/home)은 자체 큰 임베드 채팅(useOliviaLayoutStore)을 쓰므로 여기서 제외한다 —
// 두 표면 다 같은 useOliviaConversationStore.messages를 구독하므로 대화 내용은 계속 같다.
const localContextPages = ["/photoclinic", "/client-portal", "/admin/dashboard/home"];

export default function OliviaPersistentChat() {
  const pathname = usePathname();
  const router = useRouter();
  const isFullscreenWorkspace = useWorkspaceStore((s) => s.mode === "fullscreen");
  const hasLocalOlivia = localContextPages.some((path) => pathname?.startsWith(path)) || isFullscreenWorkspace;

  // 이 컴포넌트는 루트 레이아웃에 항상 마운트되어 있으므로, 훅이 아닌 Olivia 기능 실행
  // 코드(executor.ts, actionRouter.ts)가 쓸 수 있는 유일한 useRouter() 출처가 된다.
  useEffect(() => { registerOliviaRouter(router); }, [router]);

  const chatMode = useOliviaChatModeStore((state) => state.chatMode);
  const minimizeChat = useOliviaChatModeStore((state) => state.minimizeChat);
  const markUnread = useOliviaChatModeStore((state) => state.markUnread);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const messageCount = useOliviaConversationStore((state) => state.messages.length);
  const wasStreamingRef = useRef(isStreaming);

  // 최소화된 상태에서 스트리밍이 끝나(=새 답변 도착) rail의 주황 점을 켠다.
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) markUnread();
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, messageCount, markUnread]);

  // 이번 phase는 데스크톱 우선(스펙 39번) — 모바일/태블릿에서 항상 폭을 차지하는 패널을 두면
  // 화면을 다 잡아먹으므로, 그 구간에서는 예전 OliviaFloatingConversation과 동일한 방식(플로팅
  // 버튼 → 전체 오버레이 드로어)으로 폴백한다. 채팅을 아예 못 쓰게 만드는 것보다는 낫다.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (hasLocalOlivia) return null;

  if (isMobile) {
    return (
      <>
        <button type="button" className="olivia-floating-core olivia-floating-core--global" onClick={() => setMobileOpen((value) => !value)} aria-label="Olivia 대화 열기"><OliviaIcon size={18} /></button>
        <div className={`olivia-chat-drawer__scrim${mobileOpen ? " is-open" : ""}`} aria-hidden="true" onClick={() => setMobileOpen(false)} />
        <aside className={`olivia-chat-drawer olivia-chat-drawer--global${mobileOpen ? " is-open" : ""}`} aria-hidden={!mobileOpen}>
          <button type="button" className="olivia-chat-drawer__close" onClick={() => setMobileOpen(false)}>닫기</button>
          <OliviaConversation variant="drawer" />
        </aside>
      </>
    );
  }

  const isMinimized = chatMode === "minimized";
  const width = OLIVIA_CHAT_MODE_WIDTH[chatMode];
  const reduceMotion = prefersReducedMotion();

  return (
    <motion.aside
      className={`olivia-persistent-chat${isMinimized ? " is-minimized" : ""}`}
      animate={{ width }}
      transition={reduceMotion ? { duration: 0.01 } : oliviaMotion.panel}
    >
      {isMinimized ? (
        <OliviaChatDock />
      ) : (
        <OliviaConversation variant="drawer" onMinimize={minimizeChat} />
      )}
    </motion.aside>
  );
}
