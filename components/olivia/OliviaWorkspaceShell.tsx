"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import OliviaFloatingChatToggle from "@/components/olivia/OliviaFloatingChatToggle";
import { getWorkspaceTypeForPathname, shouldAutoCloseWorkspace } from "@/components/workspace/WorkspaceRegistry";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { registerOliviaRouter } from "@/lib/olivia/features/navigationBridge";
import { useOliviaChatDockStore } from "@/lib/store/useOliviaChatDockStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { isOliviaWorkspaceSplitActive, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

const HOME_PREFIX = "/admin/dashboard/home";
const CLIENT_PORTAL_PREFIX = "/client-portal";

// Olivia Agent 2.0 Phase 1 — app/layout.tsx에 항상 떠 있는 단일 진입점(예전 OliviaPersistentChat
// 자리). 앱 전체에서 <OliviaConversation> 인스턴스를 딱 하나만 소유하고, 지금 어느 DOM
// 노드(useOliviaChatDockStore)에 portal로 꽂을지만 결정한다 — 실제 노드는 홈(OliviaAdaptiveStage)
// 이나 직접 워크스페이스 라우트(OliviaWorkspaceRouteBridge)가 각자 자기 자리에 등록해둔다.
// portal 호출 자체는 이 컴포넌트 렌더마다 항상 같은 위치(같은 JSX 모양)에서 일어나므로,
// 대상 노드가 바뀌어도(홈 슬롯 → 다른 라우트의 슬롯) React가 컴포넌트를 재마운트하지 않고
// DOM만 옮긴다 — 이게 "기능이 바뀌어도 채팅이 재마운트되지 않는다"는 요구사항의 핵심이다.
export default function OliviaWorkspaceShell() {
  const pathname = usePathname();
  const router = useRouter();

  // executeOliviaAction/toolExecutor 같은 훅이 아닌 코드가 SPA 네비게이션을 쓸 수 있게 라우터를
  // 등록한다 — 예전에는 OliviaPersistentChat이 이 역할을 했다.
  useEffect(() => { registerOliviaRouter(router); }, [router]);

  const workspaceType = useWorkspaceStore((s) => s.type);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const workspaceOpenedBy = useWorkspaceStore((s) => s.openedBy);
  const layoutMode = useOliviaLayoutStore((s) => s.mode);
  const pendingWorkspaceOpen = useOliviaConversationStore((s) => s.pendingWorkspaceOpen);
  const dockNode = useOliviaChatDockStore((s) => s.node);

  const isHome = pathname?.startsWith(HOME_PREFIX) ?? false;
  const isClientPortal = pathname?.startsWith(CLIENT_PORTAL_PREFIX) ?? false;
  const isFullscreen = workspaceMode === "fullscreen";
  const registeredType = getWorkspaceTypeForPathname(pathname);
  // photo-sort는 PhotoWorkspace가 자체 탭/URL 체계를 갖고 있어 70/30 스플릿을 쓰지 않는다
  // (WorkspaceRegistry.ts 주석 참고) — 그 라우트에서는 플로팅 토글을 그대로 유지한다.
  const hasSplitViewHere = !isHome && !!registeredType && registeredType !== "photo-sort";

  // 라우트로 열린(직접 URL 진입) 워크스페이스만 자동으로 닫는다 — 채팅/카드로 연 워크스페이스는
  // 페이지 이동만으로 놀라게 닫지 않는다(shouldAutoCloseWorkspace 참고). pathname이 바뀔 때만
  // 검사해서, 워크스페이스 상태 자체의 변화(예: 채팅이 URL도 같이 동기화하는 순간)로는 다시
  // 실행되지 않게 한다 — 그래야 채팅발 전환과 경합하지 않는다.
  useEffect(() => {
    if (shouldAutoCloseWorkspace({ type: workspaceType, openedBy: workspaceOpenedBy, pathname })) {
      executeOliviaAction({ type: "CLOSE_WORKSPACE" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isClientPortal) return null; // 고객용 화면 — 기존과 동일하게 범위 밖.
  if (isFullscreen) return null; // DynamicWorkspace 자신의 body 포털 드로어가 이미 채팅을 그린다.

  const hasWorkspace = workspaceType !== null;
  const isSplitActive = isOliviaWorkspaceSplitActive({ hasWorkspace, mode: layoutMode, pendingWorkspaceOpen });
  const chatVariant = isHome ? (isSplitActive ? "workspace" : "home") : "workspace";
  const showExpandToggle = isHome ? isSplitActive : true;
  if (typeof window !== "undefined") console.log("[DEBUG dockNode]", { pathname, dockNode: dockNode ? dockNode.className : null, chatVariant });
  const chatPortal = dockNode
    ? createPortal(<OliviaConversation variant={chatVariant} showExpandToggle={showExpandToggle} />, dockNode)
    : null;

  // 홈: greeting/quick-prompt/드로어는 OliviaAdaptiveStage가 그대로 그린다 — 여기서는 그
  // 슬롯에 채팅만 꽂는다. 직접 워크스페이스 라우트: 70/30 스플릿 UI 자체(DynamicWorkspace +
  // 채팅 슬롯 div)는 OliviaWorkspaceRouteBridge가 그 페이지 트리 안에서 직접 그린다(그래야
  // GlobalFeatureSidebar가 이미 그리는 사이드바와 겹치지 않는다) — 여기서는 마찬가지로
  // 그 슬롯에 채팅만 꽂는다. 그 외(미지원 페이지, photo-sorting): 기존 플로팅 토글.
  if (isHome || hasSplitViewHere) return chatPortal;
  return <OliviaFloatingChatToggle />;
}
