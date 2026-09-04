"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Maximize2, Minimize2, Minus, Paperclip, Plus, Search, Square } from "lucide-react";
import { MarkdownText, OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { messageText } from "@/lib/olivia/v2/types";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { buildConversationExchanges } from "@/lib/olivia/conversationTimeline";
import { OliviaConversationGuide, OliviaConversationNavigator } from "@/components/olivia-v2/OliviaConversationNavigation";
import OliviaEngineBackground from "@/components/olivia-v2/OliviaEngineBackground";
// index.ts를 통해 import한다(registry.ts를 직접 import하면 안 됨) — index.ts가 builtins.ts를
// re-export하면서 select_match 등록 side effect를 트리거하기 때문이다.
import { getInlineTool } from "@/lib/olivia/inline-tools";
import OliviaChatContextBanner from "@/components/olivia/OliviaChatContextBanner";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { DESKTOP_APP_SUGGESTIONS } from "@/components/olivia-os/oliviaDesktopSuggestions";

const DEFAULT_SUGGESTIONS = ["프로젝트 요약해줘", "일정 확인 및 정리", "보고서 초안 작성", "고객 응대 문구 추천"];

export default function OliviaConversation({ variant = "main", showExpandToggle = false, onMinimize }: { variant?: "main" | "workspace" | "drawer" | "home"; showExpandToggle?: boolean; onMinimize?: () => void }) {
  const messages = useOliviaConversationStore((state) => state.messages);
  // OLIVIA OS Phase 3 §27 — 지금 포커스된 Desktop 앱이 있으면 그 앱 전용 제안으로 바꾼다.
  // Desktop 밖(다른 라우트)에서는 activeAppId가 항상 null이라 기존 기본값 그대로 나온다.
  const activeDesktopAppId = useOliviaDesktopStore((state) => (
    state.activeWindowId ? state.windows[state.activeWindowId]?.appId ?? null : null
  ));
  const suggestions = (activeDesktopAppId && DESKTOP_APP_SUGGESTIONS[activeDesktopAppId]) || DEFAULT_SUGGESTIONS;
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
  const confirmShootConfirmation = useOliviaConversationStore((state) => state.confirmShootConfirmation);
  const snoozeShootConfirmation = useOliviaConversationStore((state) => state.snoozeShootConfirmation);
  const appendMessage = useOliviaConversationStore((state) => state.appendMessage);
  const layoutMode = useOliviaLayoutStore((state) => state.mode);
  const chatFocused = useOliviaLayoutStore((state) => state.chatFocused);
  const setChatFocused = useOliviaLayoutStore((state) => state.setChatFocused);
  const expandWorkspaceChat = useOliviaLayoutStore((state) => state.expandWorkspaceChat);
  const collapseWorkspaceChat = useOliviaLayoutStore((state) => state.collapseWorkspaceChat);
  // Olivia 2.0 Phase 1 — draft는 로컬 state가 아니라 공유 store(useOliviaConversationStore)에
  // 둔다. 홈 ↔ 다른 워크스페이스 라우트 전환은 이 컴포넌트를 portal로 다른 DOM 노드에 옮기는
  // 순간이라(OliviaWorkspaceShell), 컴포넌트 fiber 보존 여부에 기대지 않아야 타이핑 중이던
  // 내용이 어떤 전환에서도 사라지지 않는다.
  const input = useOliviaConversationStore((state) => state.draft);
  const setInput = useOliviaConversationStore((state) => state.setDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const scrollFrameRef = useRef<number | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const exchanges = useMemo(() => buildConversationExchanges(messages), [messages]);
  const showConversationGuide = variant !== "home" && exchanges.length >= 4;
  const exchangeByUserMessageId = useMemo(() => {
    const map = new Map<string, (typeof exchanges)[number]>();
    for (const exchange of exchanges) map.set(exchange.userMessageId, exchange);
    return map;
  }, [exchanges]);
  const [activeMessageId, setActiveMessageId] = useState<string>();
  const [selectedGuideId, setSelectedGuideId] = useState<string>();
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const lastMessageCountRef = useRef(0);
  // 페이지를 처음 열어서 캐시/서버 기록이 아직 하나도 안 채워진 0 → N으로 바뀌는 첫 순간을
  // 따로 구분한다. 이걸 안 하면 "방금 내가 보낸 메시지"랑 똑같은 조건(0에서 늘어남)으로 오인해서,
  // 기록의 마지막 메시지가 assistant면 "위로 스크롤해서 읽는 중"으로 잘못 판단해 맨 아래로
  // 안 붙이고 "새 메시지 ↓" 버튼만 뜬 채로 멈춰 있었다 — 스플래시 직후 보이던 깜빡임의 정체.
  const hasDoneInitialScrollRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
    setShowJumpToBottom(false);
  }, []);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    // 홈 채팅에 한정 — 촬영일이 지났는데 아직 "촬영" 단계인 프로젝트가 있으면 올리비아가
    // 먼저 물어보는 메시지를 대화 맨 끝에 꽂아 넣는다. 이미 같은 insight로 물어본 적 있으면
    // (메시지 목록에 이미 있으면) 다시 안 넣는다.
    if (variant !== "home" || !isHydrated) return;
    let cancelled = false;
    fetch("/api/olivia/shoot-confirmations")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        const existingIds = new Set(
          useOliviaConversationStore.getState().messages
            .flatMap((message) => message.blocks)
            .filter((block): block is Extract<typeof block, { type: "shoot_confirm" }> => block.type === "shoot_confirm")
            .map((block) => block.insightId),
        );
        for (const item of payload.items ?? []) {
          if (existingIds.has(item.insightId)) continue;
          appendMessage({
            id: `shoot-confirm:${item.insightId}`,
            role: "assistant",
            content: "",
            status: "complete",
            blocks: [{ type: "shoot_confirm", insightId: item.insightId, workflowRunId: item.workflowRunId, clientName: item.clientName, shootDate: item.shootDate, state: "pending" }],
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [variant, isHydrated, appendMessage]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const lastMessage = messages.at(-1);

    // 캐시/서버 기록을 처음 채우는 순간(0 → N)은 "방금 보낸 메시지"나 "위로 스크롤해서
    // 읽는 중" 판단 없이 무조건 바닥으로 스냅한다 — 대화 진입 시 항상 최신 메시지부터 보여야 한다.
    if (!hasDoneInitialScrollRef.current && messages.length > 0) {
      hasDoneInitialScrollRef.current = true;
      lastMessageCountRef.current = messages.length;
      list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
      setShowJumpToBottom(false);
      return;
    }

    // 사용자가 방금 직접 보낸 메시지는 현재 스크롤 위치와 무관하게 무조건 하단으로 이동한다.
    const justSentOwnMessage = messages.length > lastMessageCountRef.current && lastMessage?.role === "user";
    lastMessageCountRef.current = messages.length;

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    // 사용자가 위로 스크롤해서 이전 대화를 읽고 있으면, 스트리밍 중이라도 바닥으로 끌어당기지 않는다.
    if (!justSentOwnMessage && distanceFromBottom > 120) {
      setShowJumpToBottom(true);
      return;
    }
    // "smooth"는 애니메이션이 끝나기 전에 다음 메시지(스트리밍 delta 등)가 도착하면 그 시점의
    // scrollTop이 아직 바닥에 안 닿은 상태라 distanceFromBottom이 120을 넘는 것으로 잘못 측정돼
    // "사용자가 위로 스크롤 중"으로 오판하고 자동 스크롤을 멈추는 경합이 있었다(2026-08-29 사용자
    // 리포트: "이미 맨 아래에 있는데도 새 답변이 오면 안 내려감"). 항상 즉시 이동으로 바꿔 경합을 없앤다.
    list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
    setShowJumpToBottom(false);
  }, [messages, isStreaming, agentStatus]);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  useEffect(() => {
    if (!activeMessageId && exchanges.length) setActiveMessageId(exchanges.at(-1)?.userMessageId);
  }, [activeMessageId, exchanges]);
  useEffect(() => {
    if (selectedGuideId && !exchanges.some((exchange) => exchange.userMessageId === selectedGuideId)) {
      setSelectedGuideId(undefined);
    }
  }, [exchanges, selectedGuideId]);
  useEffect(() => {
    if (!selectedGuideId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedGuideId(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedGuideId]);
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

  const isHome = variant === "home";
  const isEmpty = messages.length === 0;
  // 채팅창 테두리 애니메이션 상태 — 실제 대화 상태(isStreaming/chatFocused/입력값)에만
  // 연결한다. 가짜 setTimeout으로 만든 상태가 아니라 스토어가 이미 들고 있는 값 그대로다.
  const borderState = isStreaming ? "thinking" : chatFocused || input.trim().length > 0 ? "typing" : "idle";

  const submit = () => {
    const content = input.trim();
    if (!content || isSending) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendMessage(content);
  };

  const onInput = (value: string) => {
    setInput(value);
    const list = listRef.current;
    // 입력창(composer)이 여러 줄로 늘어나면 메시지 목록의 실제 높이가 줄어든다 — 스크롤 위치는
    // 그대로라서 바닥에 붙어있던 마지막 메시지가 늘어난 입력창 뒤로 가려 보인다. 늘어나기
    // 직전에 바닥 근처였는지 미리 재서, 늘어난 뒤에도 계속 바닥에 붙어 있게 한다. 위로 스크롤해
    // 이전 대화를 읽는 중이면(120px 이상 떨어짐) 건드리지 않는다.
    const wasNearBottom = list ? list.scrollHeight - list.scrollTop - list.clientHeight <= 120 : false;
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 152)}px`;
      if (wasNearBottom && list) list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
    });
  };

  const prefillHomePrompt = (prefix: string) => {
    onInput(prefix);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <section
      className={`olivia-conversation olivia-conversation--${variant}`}
      data-olivia-surface={variant}
      data-message-count={messages.length}
      data-border-state={borderState}
    >
      <header className="olivia-conversation__header">
          <div className="olivia-conversation__identity">
            <span className={`olivia-core-mark${isStreaming ? " is-thinking" : ""}`}><OliviaIcon size={15} /></span>
            <div>
              <strong>{isHome ? "Olivia Agent" : "OLIVIA"}</strong>
              <small>{isStreaming ? agentStatus || "답변 작성 중…" : isHome ? "업무 파트너" : "Context-aware agent"}</small>
            </div>
          </div>
          <div className="olivia-conversation__controls">
            {showExpandToggle ? (
              <button type="button" onClick={layoutMode === "workspace-chat-expanded" ? collapseWorkspaceChat : expandWorkspaceChat}>
                {layoutMode === "workspace-chat-expanded" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                {layoutMode === "workspace-chat-expanded" ? "작업 크게" : "대화 크게"}
              </button>
            ) : null}
            {!isEmpty ? <button type="button" onClick={() => void startNewConversation()}><Plus size={13} /> 새 대화</button> : null}
            {onMinimize ? (
              <button type="button" onClick={onMinimize} aria-label="Olivia 대화 최소화"><Minus size={13} /></button>
            ) : null}
          </div>
      </header>

      {variant === "workspace" ? <OliviaChatContextBanner /> : null}

      <div className={`olivia-conversation__stage${showConversationGuide ? " has-guide" : ""}`}>
        {isHome ? null : <OliviaConversationNavigator exchanges={exchanges} activeId={activeMessageId} onNavigate={scrollToMessage} />}
        <div className="olivia-conversation__main">
      <OliviaEngineBackground active={isStreaming} />
      <div ref={listRef} className="olivia-conversation__messages" aria-live="polite">
        {/* 로컬 캐시에 이미 메시지가 있으면(재방문) 그 메시지가 바로 그려지므로 로딩 문구를
            띄우지 않는다 — isHydrated로만 걸었더니 캐시된 메시지 위에 "불러오는 중…"이 잠깐
            겹쳐 떴다가, 서버 재확인이 끝나는 순간 그 문구만 사라지는 깜빡임이 있었다. */}
        {!isHydrated && messages.length === 0 ? <div className="olivia-conversation__empty">대화를 불러오는 중…</div> : null}
        {isHydrated && messages.length === 0 && !isHome ? (
          <div className="olivia-conversation__welcome">
            <span>OLIVIA AGENT</span>
            <h1>무엇을 도와드릴까요?</h1><p>업무 질문, 요약, 계획, 문서 작성까지 무엇이든 물어보세요.</p>
            {/* home variant는 칩을 컴포저 "아래"로 옮긴다(레퍼런스 순서: 제목→입력창→칩) —
                다른 variant(drawer/workspace)는 기존 순서(제목→칩→입력창) 그대로 유지. */}
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
                    if (block.type === "shoot_confirm") return <div key={index} className="olivia-approval-card">
                      <strong>
                        {block.state === "confirmed" ? "다음 단계로 넘겼어요" : block.state === "snoozed" ? "알겠어요, 나중에 다시 물어볼게요" : block.state === "error" ? "처리하지 못했어요" : "촬영 확인이 필요해요"}
                      </strong>
                      <span>{block.clientName} 촬영 예정일({block.shootDate})이 지났어요. 어제(또는 그 이전) {block.clientName} 촬영하셨나요?</span>
                      {(!block.state || block.state === "pending") ? <div className="olivia-approval-card__actions">
                        <button type="button" onClick={() => void confirmShootConfirmation(block.insightId)}>네, 다음 단계로</button>
                        <button type="button" onClick={() => void snoozeShootConfirmation(block.insightId)}>아직이에요</button>
                      </div> : null}
                    </div>;
                    if (block.type === "client_task") {
                      const definition = getInlineTool(block.task);
                      if (!definition) return null;
                      const InlineToolComponent = definition.component;
                      return <InlineToolComponent key={index} flowId={block.flowId} />;
                    }
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
            placeholder={isHome ? "무엇을 도와드릴까요?" : "Olivia에게 무엇이든 말해보세요…"}
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
      {isHome && isEmpty ? (
        <div className="olivia-conversation__suggestions olivia-conversation__suggestions--below-composer">
          <button type="button" onClick={() => prefillHomePrompt("업무 요청: ")}><Paperclip size={15} strokeWidth={1.7} /> 업무 요청</button>
          <button type="button" onClick={() => prefillHomePrompt("정보 검색: ")}><Search size={15} strokeWidth={1.7} /> 정보 검색</button>
        </div>
      ) : null}
        </div>
        {showConversationGuide ? <OliviaConversationGuide exchanges={exchanges} activeId={activeMessageId} selectedId={selectedGuideId} onNavigate={scrollToMessage} onSelect={setSelectedGuideId} /> : null}
      </div>
    </section>
  );
}
