"use client";

import { useEffect } from "react";
import { areWindowContextsEqual, useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import {
  buildWindowContextFromOlivia,
  resolveDocumentContextSeed,
  resolveNamedContextSeed,
  resolveWorkspaceContextSeed,
} from "@/lib/olivia/desktopContextBridgeSync";
import { useOliviaDesktopEffectiveActiveApp } from "./useOliviaDesktopEffectiveActiveApp";

// OLIVIA OS Phase 3 — Desktop Store(어떤 창이 떠 있고 어떤 게 포커스인지)와 기존
// useOliviaContextStore(서버로 전송되는 LLM 컨텍스트, lib/store/oliviaContextStore.ts)를
// 잇는 유일한 다리. 두 store를 직접 강결합하지 않기 위해 이 hook 하나만 양쪽을 안다 — Desktop
// Store 자체는 여전히 비즈니스 로직을 모른다.
//
// 새 store 필드를 만들지 않고 기존 setWorkspace(workspace, resourceId)에 얹는다 —
// getOliviaContextSnapshot/buildOliviaPageContext가 이미 activeWorkspace를 서버로 보내고
// 있으므로, LLM이 "지금 사진작업실을 보고 있다"를 알려면 이 값만 채우면 충분하다.
// export된 이유: 이 매핑 테이블 자체는 순수 데이터라 유닛 테스트로 직접 검증 가능하다
// (hook 본체는 React 렌더링이 필요해 이 repo의 node 환경 Vitest로는 직접 테스트하지 않고
// 브라우저 QA로 검증한다 — tests/oliviaDesktopContextBridge.test.ts 참고).
export const DESKTOP_APP_TO_WORKSPACE: Partial<Record<string, string>> = {
  "photo-workspace": "photo-sort",
  "select-galleries": "photo-sort",
  quote: "quote",
  contract: "contract",
  conti: "conti",
  calendar: "calendar",
};

export function useOliviaDesktopContextBridge() {
  // Olivia 채팅창 자체에 포커스가 가 있어도(입력 중) "직전에 보고 있던 앱"을 계속 컨텍스트로
  // 쓴다 — 안 그러면 채팅 입력창을 클릭하는 순간 activeWorkspace가 지워져서, 정작 채팅에게
  // 물어보려던 화면의 컨텍스트가 사라진다(브라우저 QA에서 발견).
  const effective = useOliviaDesktopEffectiveActiveApp();
  const effectiveWindowId = effective?.windowId;
  const effectiveAppId = effective?.appId;

  // WindowContext 객체 전체를 구독하지 않는다. project/resource만 바뀌어 새 context 객체가
  // 만들어졌을 때 client seed까지 재실행되던 것이 고객 A↔B feedback loop의 원인이었다.
  const windowClientId = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.clientId : undefined);
  const windowClientName = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.clientName : undefined);
  const windowProjectId = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.projectId : undefined);
  const windowProjectName = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.projectName : undefined);
  const windowResourceId = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.resourceId : undefined);
  const windowDocumentId = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.documentId : undefined);
  const windowDocumentType = useOliviaDesktopStore((state) => effectiveWindowId ? state.windows[effectiveWindowId]?.context?.documentType : undefined);
  const activeClientId = useOliviaContextStore((state) => state.activeClientId);
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);
  const activeProjectId = useOliviaContextStore((state) => state.activeProjectId);
  const activeProjectName = useOliviaContextStore((state) => state.activeProjectName);
  const activeWorkspace = useOliviaContextStore((state) => state.activeWorkspace);
  const activeResourceId = useOliviaContextStore((state) => state.activeResourceId);

  // Workspace/resource sync. 이 effect는 app 또는 window resource가 바뀔 때만 실행된다.
  useEffect(() => {
    const mapped = effectiveAppId ? DESKTOP_APP_TO_WORKSPACE[effectiveAppId] : undefined;
    const context = useOliviaContextStore.getState();
    const seed = resolveWorkspaceContextSeed({
      windowId: effectiveWindowId,
      mappedWorkspace: mapped,
      windowResourceId,
      activeValue: { workspace: context.activeWorkspace, resourceId: context.activeResourceId },
    });
    if (seed) context.setWorkspace(seed.workspace, seed.resourceId);
  }, [effectiveAppId, effectiveWindowId, windowResourceId]);

  // Client sync. Olivia store 변화는 dependency가 아니다. 따라서 사용자가 ClientsWorkspace에서
  // B를 고른 뒤 창에 남은 A가 project/resource 변화 때문에 다시 seed되는 일이 없다.
  useEffect(() => {
    const context = useOliviaContextStore.getState();
    const seed = resolveNamedContextSeed({
      windowId: effectiveWindowId,
      windowValue: { id: windowClientId, name: windowClientName },
      activeValue: { id: context.activeClientId, name: context.activeClientName },
    });
    if (seed) context.setClient(seed.id, seed.name);
  }, [effectiveWindowId, windowClientId, windowClientName]);

  // Project sync. Client와 분리해 project만 바뀔 때 setClient가 호출되지 않는다.
  useEffect(() => {
    const context = useOliviaContextStore.getState();
    const seed = resolveNamedContextSeed({
      windowId: effectiveWindowId,
      windowValue: { id: windowProjectId, name: windowProjectName },
      activeValue: { id: context.activeProjectId, name: context.activeProjectName },
    });
    if (seed) context.setProject(seed.id, seed.name);
  }, [effectiveWindowId, windowProjectId, windowProjectName]);

  // Current document sync. 문서가 닫혀 id/type이 비워진 경우도 실제 변화로 처리한다.
  useEffect(() => {
    const context = useOliviaContextStore.getState();
    const seed = resolveDocumentContextSeed({
      windowId: effectiveWindowId,
      windowValue: { id: windowDocumentId, type: windowDocumentType },
      activeValue: { id: context.currentDocumentId, type: context.currentDocumentType },
    });
    if (seed) context.setCurrentDocument(seed.id, seed.type);
  }, [effectiveWindowId, windowDocumentId, windowDocumentType]);

  // 기존 feature가 Olivia context store에 기록한 실제 선택을 활성 Window에도 되돌려 적는다.
  // 동일 값이면 쓰지 않는다. 앞의 seed effect가 같은 commit에서 store를 바꿀 수 있으므로
  // effect closure가 아닌 getState()의 최신 scalar를 읽어 오래된 값이 역으로 쓰이는 것도 막는다.
  useEffect(() => {
    if (!effectiveWindowId || !effectiveAppId) return;
    const desktop = useOliviaDesktopStore.getState();
    const win = desktop.windows[effectiveWindowId];
    if (!win) return;
    const mapped = DESKTOP_APP_TO_WORKSPACE[effectiveAppId];
    const latest = useOliviaContextStore.getState();
    const next = buildWindowContextFromOlivia({
      appId: effectiveAppId,
      mappedWorkspace: mapped,
      windowContext: win.context,
      oliviaContext: {
        clientId: latest.activeClientId,
        clientName: latest.activeClientName,
        projectId: latest.activeProjectId,
        projectName: latest.activeProjectName,
        workspace: latest.activeWorkspace,
        resourceId: latest.activeResourceId,
      },
    });
    if (areWindowContextsEqual(win.context, next)) return;
    desktop.updateWindowContext(effectiveWindowId, next);
  }, [activeClientId, activeClientName, activeProjectId, activeProjectName, activeResourceId, activeWorkspace, effectiveAppId, effectiveWindowId]);
}
