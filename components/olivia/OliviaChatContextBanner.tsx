"use client";

import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { clearOliviaChatContextLink, useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaDesktopEffectiveActiveApp } from "@/components/olivia-os/useOliviaDesktopEffectiveActiveApp";

const CLIENT_TARGET_SOURCE_LABEL = {
  screen: "화면",
  conversation: "대화",
  explicit: "직접 지정",
} as const;

// 스펙 §42 — Full Editor를 직접 열어놓은 채 Chat을 열면(또는 split-view에서 이미 작업 중인
// 화면이 있으면) "지금 무엇을 작업 중인지"를 채팅 쪽에서도 보여준다. split(왼쪽 워크스페이스
// + 오른쪽 채팅) 상태에서만 의미가 있다 — fullscreen에서는 DynamicWorkspace.tsx 자체 헤더가
// 이미 같은 정보("OLIVIA CONTEXT ACTIVE" + 클라이언트명 + 라벨)를 보여주므로 중복 표시하지
// 않는다(견적서 UX 개편, 2026-08-31).
//
// OLIVIA OS Phase 3(스펙 §23/§24) — Desktop 창 조작 라우트에서는 이 슬롯을 재사용해 "지금 어느
// 창을 보고 있는지"를 보여준다. Desktop 창은 legacy 라우트에서 절대 열리지 않으므로 effective
// active app이 있으면 이 배너를 Desktop 전용으로 쓰고, 없으면 기존 legacy split-view 분기로
// 그대로 폴백한다 — 다른 라우트 동작은 전혀 안 바뀐다. useOliviaDesktopEffectiveActiveApp을
// 쓰는 이유: Olivia 채팅창 자신에 포커스가 가 있을 때 "● Olivia"처럼 순환적인 표시가 되는
// 문제가 있어서(브라우저 QA에서 발견), "직전에 보고 있던 창"을 대신 보여준다.
export default function OliviaChatContextBanner() {
  const effective = useOliviaDesktopEffectiveActiveApp();
  const windowTitle = useOliviaDesktopStore((state) => (
    effective ? state.windows[effective.windowId]?.title : undefined
  ));
  const windowDocumentType = useOliviaDesktopStore((state) => (
    effective ? state.windows[effective.windowId]?.context?.documentType : undefined
  ));
  const windowDocumentTitle = useOliviaDesktopStore((state) => (
    effective ? state.windows[effective.windowId]?.context?.documentTitle : undefined
  ));
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);
  const activeClientId = useOliviaContextStore((state) => state.activeClientId);
  const activeClientSource = useOliviaContextStore((state) => state.activeClientSource);
  const activeWorkspace = useOliviaContextStore((state) => state.activeWorkspace);
  const currentDocumentId = useOliviaContextStore((state) => state.currentDocumentId);

  const type = useWorkspaceStore((state) => state.type);
  const mode = useWorkspaceStore((state) => state.mode);
  const clientName = useWorkspaceStore((state) => state.clientName);
  const workspaceTitle = useWorkspaceStore((state) => state.workspaceTitle);
  const hasClientTarget = Boolean(activeClientId || activeClientName);
  const targetLabel = activeClientName || (hasClientTarget ? "이름 없는 고객" : "선택되지 않음");
  const targetSourceLabel = activeClientSource ? CLIENT_TARGET_SOURCE_LABEL[activeClientSource] : undefined;
  const targetText = `${targetLabel}${targetSourceLabel ? ` (${targetSourceLabel})` : ""}`;
  const clearTargetButton = hasClientTarget ? (
    <button type="button" onClick={clearOliviaChatContextLink} aria-label="현재 고객 대상 해제">
      대상 해제
    </button>
  ) : null;

  const documentTypeLabel = windowDocumentType === "quote"
    ? "견적서"
    : windowDocumentType === "contract"
      ? "계약서"
      : windowDocumentType === "conti"
        ? "콘티"
        : undefined;

  // 문서 창 자체는 닫지 않고 대상만 해제할 수 있다. 이때 남아 있는 창을 다시 "현재 작업"으로
  // 표시하면 배너가 두 스토어와 어긋난다. 문서 연결이 살아 있을 때만 문서 창을 채팅 상단에 싣는다.
  const hasDocumentLink = Boolean(activeWorkspace || currentDocumentId);
  if (effective && windowTitle && (!documentTypeLabel || hasDocumentLink)) {
    const currentWindowLabel = documentTypeLabel
      ? `${documentTypeLabel} · ${windowDocumentTitle || windowTitle}`
      : windowTitle;
    return (
      <div className="olivia-chat-context-banner">
        <span>지금 대상: {targetText} · 현재 창: {currentWindowLabel}</span>
        {clearTargetButton}
        <button type="button" onClick={() => focusWindow(effective.windowId)}>
          창 보기
        </button>
      </div>
    );
  }
  if (mode !== "split" || !type) {
    return (
      <div className="olivia-chat-context-banner">
        <span>지금 대상: {targetText}</span>
        {clearTargetButton}
      </div>
    );
  }
  const entry = workspaceRegistry[type];
  if (!entry) {
    return (
      <div className="olivia-chat-context-banner">
        <span>지금 대상: {targetText}</span>
        {clearTargetButton}
      </div>
    );
  }

  const label = workspaceTitle || `${clientName ? `${clientName} ` : ""}${entry.label}`;

  return (
    <div className="olivia-chat-context-banner">
      <span>지금 대상: {targetText} · 현재 작업: {label}</span>
      {clearTargetButton}
      <button type="button" onClick={() => executeOliviaAction({ type: "ENTER_FULLSCREEN" })}>
        전체화면으로 열기
      </button>
    </div>
  );
}
