import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { WINDOW_DOCK_GAP, resolveDockLayout } from "@/components/olivia-os/window/windowDocking";
import { DESKTOP_DOCK_SAFE_AREA, useOliviaDesktopStore, type OliviaWindowState } from "@/lib/store/useOliviaDesktopStore";
import { clearOliviaChatContextLink } from "@/lib/store/oliviaContextStore";

/** 이 셋은 채팅으로 만든 뒤 바로 함께 보여 주는 문서 창이다. */
export const CHAT_LINKED_DOCUMENT_APP_IDS = new Set(["quote", "contract", "conti"]);

export function isChatLinkedDocumentWindow(window?: Pick<OliviaWindowState, "appId">): boolean {
  return Boolean(window && CHAT_LINKED_DOCUMENT_APP_IDS.has(window.appId));
}

/**
 * 문서 창을 닫는 유일한 진입점.
 *
 * 창의 X, ⌘W, 상단 메뉴, 채팅 명령이 저마다 closeWindow를 직접 부르면 한 경로에서는
 * "현재 창"이 남는다. 닫기와 채팅 연결 해제를 한 동작으로 취급한다.
 */
export function closeOliviaDesktopWindow(windowId: string): void {
  const desktop = useOliviaDesktopStore.getState();
  const closing = desktop.windows[windowId];
  if (!closing) return;
  desktop.closeWindow(windowId);
  if (!isChatLinkedDocumentWindow(closing)) return;

  // 대화 메시지 기록은 건드리지 않는다. 화면에서 생긴 대상 캐시만 비워, 다음 새 요청이
  // 닫은 문서/고객/금액을 암묵적으로 재사용하지 않게 한다.
  clearOliviaChatContextLink();
}

/** 채팅창을 문서창의 자식으로 붙인다. 작은 화면에서도 채팅 최소폭을 먼저 보장한다. */
export function attachOliviaChatToDocumentWindow(documentWindowId: string): void {
  const desktop = useOliviaDesktopStore.getState();
  const documentWindow = desktop.windows[documentWindowId];
  if (!isChatLinkedDocumentWindow(documentWindow)) return;

  const chatApp = getOliviaApp("olivia-chat");
  if (!chatApp) return;
  if (!desktop.windows["olivia-chat"]) {
    desktop.openApp({
      appId: chatApp.id,
      title: chatApp.title,
      width: chatApp.defaultSize.width,
      height: chatApp.defaultSize.height,
      placement: "right",
    });
  } else if (desktop.windows["olivia-chat"]?.minimized) {
    desktop.restoreWindow("olivia-chat");
  }

  // openApp/restoreWindow가 동기적으로 zustand 상태를 갱신하므로 최신 스냅샷을 다시 읽는다.
  const current = useOliviaDesktopStore.getState();
  const parent = current.windows[documentWindowId];
  const chat = current.windows["olivia-chat"];
  if (!parent || !chat || current.workspaceWidth <= 0 || current.workspaceHeight <= 0) return;

  const edge = 12;
  const chatWidth = Math.max(340, Math.min(chat.width, 420));
  const maxParentWidth = current.workspaceWidth - edge * 2 - WINDOW_DOCK_GAP - chatWidth;
  if (maxParentWidth < 420) return;
  const layout = resolveDockLayout(
    { ...parent, width: Math.min(parent.width, maxParentWidth) },
    { ...chat, width: chatWidth },
    current.workspaceWidth,
    current.workspaceHeight,
    DESKTOP_DOCK_SAFE_AREA,
    340,
  );
  if (!layout) return;
  current.dockWindow("olivia-chat", documentWindowId, layout);
  current.focusWindow(documentWindowId);
}
