"use client";

import { useCallback, useEffect } from "react";
import html2canvas from "html2canvas";
import { Camera, LayoutGrid, MessageSquare, Monitor, Search } from "lucide-react";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import styles from "./OliviaDesktop.module.css";

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function captureFilename(now = new Date()) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `olivia-${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}.png`;
}

const nextPaint = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

export function DesktopTopBarActions() {
  const tiledSnapshot = useOliviaDesktopStore((state) => state.tiledSnapshot);
  const windows = useOliviaDesktopStore((state) => state.windows);
  const showDesktopStash = useOliviaDesktopStore((state) => state.showDesktopStash);
  const tileWindows = useOliviaDesktopStore((state) => state.tileWindows);
  const untileWindows = useOliviaDesktopStore((state) => state.untileWindows);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const chatCompact = useOliviaDesktopUtilityStore((state) => state.chatCompact);
  const setChatCompact = useOliviaDesktopUtilityStore((state) => state.setChatCompact);
  const setGlobalSearchOpen = useOliviaDesktopUtilityStore((state) => state.setGlobalSearchOpen);
  const captureInProgress = useOliviaDesktopUtilityStore((state) => state.captureInProgress);
  const setCaptureInProgress = useOliviaDesktopUtilityStore((state) => state.setCaptureInProgress);
  const showNotice = useOliviaDesktopUtilityStore((state) => state.showNotice);
  const isSending = useOliviaConversationStore((state) => state.isSending);

  const toggleCompactChat = useCallback(() => {
    const app = getOliviaApp("olivia-chat");
    if (!app) {
      showNotice("Olivia 채팅 창을 찾지 못했습니다.", "error");
      return;
    }

    const chatWindow = windows[app.id];
    setChatCompact(!chatCompact);
    if (!chatWindow) {
      openApp({
        appId: app.id,
        title: app.title,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        placement: "right",
      });
    } else if (chatWindow.minimized) {
      restoreWindow(chatWindow.id);
    } else {
      focusWindow(chatWindow.id);
    }
  }, [chatCompact, focusWindow, openApp, restoreWindow, setChatCompact, showNotice, windows]);

  const toggleTiling = useCallback(() => {
    if (chatCompact) setChatCompact(false);
    if (tiledSnapshot) {
      untileWindows();
      return;
    }
    if (!Object.values(windows).some((window) => !window.minimized)) {
      showNotice("정리할 창이 없어요");
      return;
    }
    tileWindows();
  }, [chatCompact, setChatCompact, tileWindows, tiledSnapshot, untileWindows, windows, showNotice]);

  useEffect(() => {
    if (chatCompact && isSending) setChatCompact(false);
  }, [chatCompact, isSending, setChatCompact]);

  const captureDesktop = async () => {
    if (captureInProgress) return;
    const root = document.querySelector<HTMLElement>("[data-olivia-desktop-root]");
    if (!root) {
      showNotice("캡처할 Olivia 데스크톱 화면을 찾지 못했습니다.", "error");
      return;
    }

    setCaptureInProgress(true);
    try {
      // The action row is visibility-hidden before html2canvas samples the DOM.
      await nextPaint();
      await nextPaint();
      const canvas = await html2canvas(root, {
        backgroundColor: null,
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = captureFilename();
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
      showNotice(`화면 캡처를 저장하지 못했습니다${detail}`, "error");
    } finally {
      setCaptureInProgress(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || (!event.metaKey && !event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "/" && !event.shiftKey) {
        event.preventDefault();
        toggleCompactChat();
      } else if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        setGlobalSearchOpen(true);
      } else if (key === "t" && event.shiftKey) {
        event.preventDefault();
        toggleTiling();
      } else if (key === "d" && event.shiftKey) {
        event.preventDefault();
        toggleShowDesktop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setGlobalSearchOpen, toggleCompactChat, toggleShowDesktop, toggleTiling]);

  const actions = [
    { id: "chat", label: chatCompact ? "채팅 펼치기" : "채팅 한 줄로 접기", shortcut: "⌘/", Icon: MessageSquare, active: chatCompact, onClick: toggleCompactChat },
    { id: "search", label: "찾기", shortcut: "⌘F", Icon: Search, active: false, onClick: () => setGlobalSearchOpen(true) },
    { id: "tile", label: tiledSnapshot ? "창 정리 되돌리기" : "창 정리", shortcut: "⌘⇧T", Icon: LayoutGrid, active: Boolean(tiledSnapshot), onClick: toggleTiling },
    { id: "desktop", label: "바탕화면", shortcut: "⌘⇧D", Icon: Monitor, active: Boolean(showDesktopStash), onClick: toggleShowDesktop },
    { id: "capture", label: "화면 캡처", shortcut: "", Icon: Camera, active: false, onClick: () => void captureDesktop(), disabled: captureInProgress },
  ];

  return (
    <div className={styles.topBarCenter} data-capturing={captureInProgress || undefined} aria-label="빠른 기능">
      {actions.map(({ id, label, shortcut, Icon, active, onClick, disabled }) => (
        <button
          key={id}
          type="button"
          className={`${styles.topBarAction} ${active ? styles.topBarActionActive : ""}`}
          onClick={onClick}
          disabled={disabled}
          aria-label={shortcut ? `${label} (${shortcut})` : label}
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
          <span className={styles.topBarActionTooltip} role="tooltip">{label}{shortcut ? ` ${shortcut}` : ""}</span>
        </button>
      ))}
    </div>
  );
}
