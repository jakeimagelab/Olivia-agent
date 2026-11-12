"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PROJECT_MESSAGE_POLL_INTERVAL_MS, shouldRunVisiblePoll } from "@/lib/client/visiblePolling";
import type { PersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";

export type CustomerBridgeSideTab = "preview" | "chat";

export function customerBridgeUnreadIncrement({
  previousLastId,
  nextLastId,
  previousLength,
  nextLength,
  viewingChat,
}: {
  previousLastId: string | null;
  nextLastId: string | null;
  previousLength: number;
  nextLength: number;
  viewingChat: boolean;
}) {
  if (viewingChat || !previousLastId || !nextLastId || previousLastId === nextLastId) return 0;
  return Math.max(1, nextLength - previousLength);
}

function createMessageRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `message_${crypto.randomUUID()}`;
  return `message_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function useCustomerBridgeMessages({
  endpointBase,
  enabled,
  mobile,
  focusedImageId,
}: {
  endpointBase: string;
  enabled: boolean;
  mobile: boolean;
  focusedImageId: string | null;
}) {
  const [sideTab, setSideTab] = useState<CustomerBridgeSideTab>("preview");
  const [mobileSideOpen, setMobileSideOpen] = useState(false);
  const [messages, setMessages] = useState<PersonSelectProjectMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [messageState, setMessageState] = useState("");
  const [messageImageScoped, setMessageImageScoped] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sideTabRef = useRef(sideTab);
  const lastMessageIdRef = useRef<string | null>(null);
  const messagesLengthRef = useRef(0);
  const messageRefreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    sideTabRef.current = sideTab;
    if (sideTab === "chat") {
      setUnreadMessages(0);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: "end" }));
    }
  }, [messages.length, sideTab]);

  const loadMessages = useCallback((options?: { quiet?: boolean }) => {
    if (!enabled) return Promise.resolve();
    if (messageRefreshInFlightRef.current) return messageRefreshInFlightRef.current;
    const request = (async () => {
      try {
        const response = await fetch(`${endpointBase}/messages`, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "대화를 불러오지 못했습니다.");
        const next = Array.isArray(result.messages) ? result.messages as PersonSelectProjectMessage[] : [];
        const nextLastId = next.at(-1)?.id ?? null;
        const unreadIncrement = customerBridgeUnreadIncrement({
          previousLastId: lastMessageIdRef.current,
          nextLastId,
          previousLength: messagesLengthRef.current,
          nextLength: next.length,
          viewingChat: sideTabRef.current === "chat",
        });
        if (unreadIncrement) setUnreadMessages((count) => count + unreadIncrement);
        lastMessageIdRef.current = nextLastId;
        messagesLengthRef.current = next.length;
        setMessages(next);
        setMessageState("");
        if (sideTabRef.current === "chat") requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: "end" }));
      } catch (error) {
        if (!options?.quiet) setMessageState(error instanceof Error ? error.message : "대화 연결을 확인해 주세요.");
      }
    })();
    messageRefreshInFlightRef.current = request;
    void request.finally(() => {
      if (messageRefreshInFlightRef.current === request) messageRefreshInFlightRef.current = null;
    });
    return request;
  }, [enabled, endpointBase]);

  const messagePanelVisible = enabled && sideTab === "chat" && (!mobile || mobileSideOpen);
  useEffect(() => {
    if (!messagePanelVisible) return;
    const refresh = (quiet = true) => {
      if (!shouldRunVisiblePoll({
        enabled,
        surfaceVisible: messagePanelVisible,
        documentVisibility: document.visibilityState,
      })) return;
      void loadMessages({ quiet });
    };
    const onFocus = () => refresh();
    const onVisibility = () => refresh();

    refresh(false);
    const pollTimer = window.setInterval(refresh, PROJECT_MESSAGE_POLL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(pollTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, loadMessages, messagePanelVisible]);

  const sendMessage = useCallback(async () => {
    const body = messageText.trim();
    if (!enabled || !body || sendingMessage) return;
    setSendingMessage(true);
    setMessageState("전송 중");
    try {
      const response = await fetch(`${endpointBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          requestId: createMessageRequestKey(),
          imageId: messageImageScoped ? focusedImageId : null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "메시지를 보내지 못했습니다.");
      setMessageText("");
      await loadMessages({ quiet: true });
      setMessageState("");
    } catch (error) {
      setMessageState(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      setSendingMessage(false);
    }
  }, [enabled, endpointBase, focusedImageId, loadMessages, messageImageScoped, messageText, sendingMessage]);

  return {
    sideTab,
    setSideTab,
    mobileSideOpen,
    setMobileSideOpen,
    messages,
    messageText,
    setMessageText,
    messageState,
    messageImageScoped,
    setMessageImageScoped,
    unreadMessages,
    sendingMessage,
    messagesEndRef,
    sendMessage,
  };
}
