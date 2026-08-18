"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Maximize2, Minimize2, Minus, Plus, Square } from "lucide-react";
import { MarkdownText, OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { messageText } from "@/lib/olivia/v2/types";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { buildConversationExchanges } from "@/lib/olivia/conversationTimeline";
import { OliviaConversationGuide, OliviaConversationNavigator } from "@/components/olivia-v2/OliviaConversationNavigation";
import OliviaEngineBackground from "@/components/olivia-v2/OliviaEngineBackground";

export default function OliviaConversation({ variant = "main", showExpandToggle = false, onMinimize }: { variant?: "main" | "workspace" | "drawer" | "home"; showExpandToggle?: boolean; onMinimize?: () => void }) {
  const messages = useOliviaConversationStore((state) => state.messages);
  const isHydrated = useOliviaConversationStore((state) => state.isHydrated);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const isStreaming = useOliviaConversationStore((state) => state.isStreaming);
  const agentStatus = useOliviaConversationStore((state) => state.agentStatus);
  const hydrate = useOliviaConversationStore((state) => state.hydrate);
  const sendMessage = useOliviaConversationStore((state) => state.sendMessage);
  const stopResponse = useOliviaConversationStore((state) => state.stopResponse);
  const retryLast = useOliviaConversationStore((state) => state.retryLast);
  const startNewConversation = useOliviaConversationStore((state) => state.startNewConversation);
  const approveAction = useOliviaConversationStore((state) => state.approveAction);
  const cancelApproval = useOliviaConversationStore((state) => state.cancelApproval);
  const layoutMode = useOliviaLayoutStore((state) => state.mode);
  const setChatFocused = useOliviaLayoutStore((state) => state.setChatFocused);
  const expandWorkspaceChat = useOliviaLayoutStore((state) => state.expandWorkspaceChat);
  const collapseWorkspaceChat = useOliviaLayoutStore((state) => state.collapseWorkspaceChat);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const scrollFrameRef = useRef<number | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const exchanges = useMemo(() => buildConversationExchanges(messages), [messages]);
  const exchangeByUserMessageId = useMemo(() => {
    const map = new Map<string, (typeof exchanges)[number]>();
    for (const exchange of exchanges) map.set(exchange.userMessageId, exchange);
    return map;
  }, [exchanges]);
  const [activeMessageId, setActiveMessageId] = useState<string>();
  const [selectedGuideId, setSelectedGuideId] = useState<string>();
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
    setShowJumpToBottom(false);
  }, []);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const lastMessage = messages.at(-1);
    // 사용자가 방금 직접 보낸 메시지는 현재 스크롤 위치와 무관하게 무조건 하단으로 이동한다.
    const justSentOwnMessage = messages.length > lastMessageCountRef.current && lastMessage?.role === "user";
    lastMessageCountRef.current = messages.length;

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    // 사용자가 위로 스크롤해서 이전 대화를 읽고 있으면, 스트리밍 중이라도 바닥으로 끌어당기지 않는다.
    if (!justSentOwnMessage && distanceFromBottom > 120) {
      setShowJumpToBottom(true);
      return;
    }
    list.scrollTo({ top: list.scrollHeight, behavior: isStreaming ? "auto" : "smooth" });
    setShowJumpToBottom(false);
  }, [messages, isStreaming, agentStatus]);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  useEffect(() => {
    if (!activeMessageId && exchanges.length) setActiveMessageId(exchanges.at(-1)?.userMessageId);
  }, [activeMessageId, exchanges]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateActive = () => {
      scrollFrameRef.current = null;
      const targetY = list.getBoundingClientRect().top + Math.min(150, list.clientHeight * .3);
      let closestId = exchanges.at(-1)?.userMessageId;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const exchange of exchanges) {
        const element = messageRefs.current.get(exchange.userMessageId);
        if (!element) continue;
        const distance = Math.abs(element.getBoundingClientRect().top - targetY);
        if (distance < closestDistance) { closestDistance = distance; closestId = exchange.userMessageId; }
      }
      if (closestId) setActiveMessageId((current) => current === closestId ? current : closestId);
      const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (distanceFromBottom < 120) setShowJumpToBottom(false);
    };
    const onScroll = () => {
      if (scrollFrameRef.current == null) scrollFrameRef.current = requestAnimationFrame(updateActive);
    };
    updateActive();
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      list.removeEventListener("scroll", onScroll);
      if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [exchanges]);

  const scrollToMessage = useCallback((messageId: string) => {
    messageRefs.current.get(messageId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveMessageId(messageId);
  }, []);

  const submit = () => {
    const content = input.trim();
    if (!content || isSending) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendMessage(content);
  };

  const onInput = (value: string) => {
    setInput(value);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 152)}px`;
    });
  };

  return (
    <section
      className={`olivia-conversation olivia-conversation--${variant}`}
      data-olivia-surface={variant}
      data-message-count={messages.length}
    >
      <header className="olivia-conversation__header">
        <div className="olivia-conversation__identity">
          <span className={`olivia-core-mark${isStreaming ? " is-thinking" : ""}`}><OliviaIcon size={15} /></span>
          <div><strong>OLIVIA</strong><small>{isStreaming ? agentStatus || "답변 작성 중…" : "Context-aware agent"}</small></div>
        </div>
        <div className="olivia-conversation__controls">
          {showExpandToggle ? (
            <button type="button" onClick={layoutMode === "workspace-chat-expanded" ? collapseWorkspaceChat : expandWorkspaceChat}>
              {layoutMode === "workspace-chat-expanded" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {layoutMode === "workspace-chat-expanded" ? "작업 크게" : "대화 크게"}
            </button>
          ) : null}
          <button type="button" onClick={() => void startNewConversation()}><Plus size={13} /> 새 대화</button>
          {onMinimize ? (
            <button type="button" onClick={onMinimize} aria-label="Olivia 대화 최소화"><Minus size={13} /></button>
          ) : null}
        </div>
      </header>

      <div className="olivia-conversation__stage">
        <OliviaConversationNavigator exchanges={exchanges} activeId={activeMessageId} onNavigate={scrollToMessage} />
        <div className="olivia-conversation__main">
      <OliviaEngineBackground active={isStreaming} />
      <div ref={listRef} className="olivia-conversation__messages" aria-live="polite">
        {!isHydrated ? <div className="olivia-conversation__empty">대화를 불러오는 중…</div> : null}
        {isHydrated && messages.length === 0 ? (
          <div className="olivia-conversation__welcome">
            <span>OLIVIA AGENT</span>
            <h1>무엇을 도와드릴까요?</h1>
            <p>업무 질문, 요약, 계획, 문서 작성까지 무엇이든 물어보세요.</p>
            <div className="olivia-conversation__suggestions">
              {["프로젝트 요약해줘", "일정 확인 및 정리", "보고서 초안 작성", "고객 응대 문구 추천"].map((prompt) => (
                <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>{prompt}</button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message) => {
          const exchange = message.role === "user" ? exchangeByUserMessageId.get(message.id) : undefined;
          return (
            <Fragment key={message.id}>
              {exchange?.topicChanged ? (
                <div className="olivia-topic-divider" data-topic={exchange.topicKey}>
                  <span className="olivia-topic-divider__line" />
                  <span className="olivia-topic-divider__chip">{exchange.previousTopicLabel} → {exchange.topicLabel}</span>
                  <span className="olivia-topic-divider__line" />
                </div>
              ) : null}
              <article
                ref={(element) => { if (element) messageRefs.current.set(message.id, element); else messageRefs.current.delete(message.id); }}
                data-message-id={message.id}
                className={`olivia-message is-${message.role}`}
              >
                {message.role === "assistant" ? <span className="olivia-message__avatar"><OliviaIcon size={12} /></span> : null}
                <div className="olivia-message__body">
                  {message.blocks.map((block, index) => {
                    if (block.type === "text") return <MarkdownText key={index} text={block.text} isUser={message.role === "user"} />;
                    if (block.type === "status") return <div key={index} className="olivia-message__status">{block.text}</div>;
                    if (block.type === "resource_card") return <div key={index} className="olivia-resource-card"><strong>{block.title || block.resourceType}</strong><span>{block.summary || block.resourceId}</span></div>;
                    if (block.type === "error") return <div key={index} className="olivia-message__error">{block.message}<button type="button" onClick={() => void retryLast()}>다시 시도</button></div>;
                    if (block.type === "approval") return <div key={index} className="olivia-approval-card">
                      <strong>{block.state === "approved" ? "처리했어요" : block.state === "cancelled" ? "취소했어요" : block.state === "error" ? "처리하지 못했어요" : "확인이 필요해요"}</strong>
                      <span>{block.summary}</span>
                      {(!block.state || block.state === "pending") ? <div className="olivia-approval-card__actions">
                        <button type="button" onClick={() => void approveAction(block.approvalId, block.toolName, block.toolInput)}>{block.confirmLabel}</button>
                        <button type="button" onClick={() => cancelApproval(block.approvalId)}>취소</button>
                      </div> : null}
                    </div>;
                    return null;
                  })}
                  {message.status === "streaming" && !messageText(message) ? <span className="olivia-typing"><i /><i /><i /></span> : null}
                </div>
              </article>
            </Fragment>
          );
        })}
        {agentStatus && isStreaming ? <div className="olivia-agent-status"><span />{agentStatus}</div> : null}
      </div>

      {showJumpToBottom ? (
        <button type="button" className="olivia-jump-to-bottom" onClick={() => scrollToBottom()}>
          새 메시지 ↓
        </button>
      ) : null}

      <div className="olivia-composer-shell">
        <div className="olivia-composer">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            placeholder="Olivia에게 무엇이든 말해보세요…"
            onChange={(event) => onInput(event.target.value)}
            onFocus={() => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); setChatFocused(true); }}
            onBlur={() => { blurTimerRef.current = setTimeout(() => setChatFocused(false), 450); }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              // 한글 조합 중 Enter는 글자 확정용일 수 있다 — 이때 보내면 마지막 글자가 입력창에 남는다.
              if (isComposingRef.current || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
          />
          <button
            type="button"
            className={isStreaming ? "is-stop" : "is-send"}
            aria-label={isStreaming ? "응답 중지" : "전송"}
            onClick={isStreaming ? stopResponse : submit}
            disabled={!isStreaming && !input.trim()}
          >
            {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
        </div>
        <OliviaConversationGuide exchanges={exchanges} activeId={activeMessageId} selectedId={selectedGuideId} onNavigate={scrollToMessage} onSelect={setSelectedGuideId} />
      </div>
    </section>
  );
}
