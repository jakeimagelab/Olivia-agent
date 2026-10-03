"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Maximize2 } from "lucide-react";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { messageText } from "@/lib/olivia/v2/types";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import styles from "./OliviaDesktop.module.css";

export function OliviaMiniChat() {
  const open = useOliviaDesktopUtilityStore((state) => state.miniChatOpen);
  const setOpen = useOliviaDesktopUtilityStore((state) => state.setMiniChatOpen);
  const showNotice = useOliviaDesktopUtilityStore((state) => state.showNotice);
  const hydrate = useOliviaConversationStore((state) => state.hydrate);
  const messages = useOliviaConversationStore((state) => state.messages);
  const draft = useOliviaConversationStore((state) => state.draft);
  const setDraft = useOliviaConversationStore((state) => state.setDraft);
  const sendMessage = useOliviaConversationStore((state) => state.sendMessage);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const agentStatus = useOliviaConversationStore((state) => state.agentStatus);
  const pendingWorkspaceOpen = useOliviaConversationStore((state) => state.pendingWorkspaceOpen);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hovered, setHovered] = useState(false);
  const [responseVisible, setResponseVisible] = useState(false);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const responseText = lastAssistant ? messageText(lastAssistant) : "";
  const responseId = lastAssistant?.id;
  const displayText = isStreaming ? responseText || agentStatus || "답변을 준비하고 있어요…" : responseText;

  useEffect(() => {
    if (open) void hydrate();
  }, [hydrate, open]);

  useEffect(() => {
    if (!open || !responseId || !displayText) return;
    setResponseVisible(true);
  }, [displayText, open, responseId]);

  useEffect(() => {
    if (!open || !responseVisible || isStreaming || hovered) return;
    const timer = window.setTimeout(() => setResponseVisible(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [hovered, isStreaming, open, responseVisible, responseId]);

  useEffect(() => {
    if (!open || !pendingWorkspaceOpen) return;
    // A shared tool has started opening a full workspace (quote/contract/conti).
    // The existing conversation owns that workflow, so the narrow prompt yields.
    setOpen(false);
  }, [open, pendingWorkspaceOpen, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (isStreaming || rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isStreaming, open, setOpen]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  const resizeTextarea = () => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 86)}px`;
  };

  const submit = () => {
    const content = draft.trim();
    if (!content || isSending) return;
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setResponseVisible(true);
    void sendMessage(content);
  };

  const promoteToWindow = () => {
    const app = getOliviaApp("olivia-chat");
    if (!app) {
      showNotice("기존 Olivia 채팅 창을 찾지 못했습니다.", "error");
      return;
    }
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height, placement: "right" });
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={styles.miniChat}
      role="dialog"
      aria-label="Olivia 빠른 채팅"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {responseVisible && displayText ? (
        <div className={styles.miniChatResponse} aria-live={isStreaming ? "polite" : undefined}>
          <button type="button" className={styles.miniChatPromote} onClick={promoteToWindow} aria-label="대화 창으로 열기" title="창으로 열기">
            <Maximize2 size={13} aria-hidden="true" />
          </button>
          <p>{displayText}</p>
          {!isStreaming ? <button type="button" className={styles.miniChatResponseMore} onClick={promoteToWindow}>… 창으로 열기</button> : null}
        </div>
      ) : null}
      <div className={styles.miniChatComposer}>
        {isSending ? <LoaderCircle className={styles.miniChatSpinner} size={15} aria-label="응답 대기 중" /> : null}
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          placeholder="Olivia에게 한 줄로…"
          aria-label="Olivia에게 메시지 보내기"
          onChange={(event) => {
            setDraft(event.target.value);
            resizeTextarea();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            submit();
          }}
        />
        <button type="button" className={styles.miniChatSend} onClick={submit} disabled={!draft.trim() || isSending} aria-label="전송">
          <ArrowUp size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
