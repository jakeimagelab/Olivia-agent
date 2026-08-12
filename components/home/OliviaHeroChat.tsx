"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, BarChart3, Camera, ChevronDown, Mic, Paperclip, Sparkles, Square, Sun } from "lucide-react";
import { C } from "@/lib/theme";
import { MarkdownText, OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import {
  AUTO_EXECUTE_TOOLS,
  TOOL_ICONS,
  dispatchOliviaDataChanged,
  summarizeTool,
  type OliviaMessage as Message,
} from "@/lib/olivia/chatShared";
import { isAutoExecutableClientCreate } from "@/lib/olivia/crud/autoExecution";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { uiActionResolvers } from "@/lib/olivia/agent/uiActionResolvers";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";

// 홈 화면 최상단에 임베드되는 큰 Olivia 채팅 — 오른쪽 하단 플로팅 위젯(components/OliviaChat.tsx)과
// 완전히 같은 /api/olivia + /api/olivia/messages 프로토콜을 쓰고 같은 대화 스레드를 공유한다
// (그래서 홈에서 나눈 대화가 다른 페이지의 플로팅 챗에도 그대로 이어진다).
// 다만 여기서는 첨부/드래그리사이즈/기기 간 실시간 폴링처럼 플로팅 위젯 전용 기능은 아직 생략했다.
//
// Agent Action Protocol — 도구별 if문을 여기 늘어놓지 않는다. 도구 이름이 lib/olivia/agent/
// uiActionResolvers.ts에 등록돼 있으면 그 도구의 결과를 OliviaUiAction으로 바꿔서
// executeOliviaAction에 넘기고(워크스페이스를 여는 등 실제 처리는 그쪽 책임), 등록 안 됐거나
// 리졸버가 null을 반환하면(예: 등록 안 된 신규 고객) 기존 도구 실행 경로로 그대로 폴백한다.

const SUGGESTED_PROMPTS = [
  { icon: Sun, text: "이번 촬영 일정과\n필요한 장비 리스트 확인해줘", accent: "#EB8F22" },
  { icon: Camera, text: "히어산부인과 견적서\n초안 만들어줘", accent: "#155855" },
  { icon: BarChart3, text: "최근 프로젝트 진행 현황\n요약해줘", accent: "#155855" },
];

export default function OliviaHeroChat({ compact = false }: { compact?: boolean } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const deviceIdRef = useRef<string>("");
  if (!deviceIdRef.current) {
    deviceIdRef.current = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // 홈에 새로 들어올 때마다 과거 대화를 전부 불러와 보여주지는 않는다 — 매번 인사말로 시작한다.
  // 다만 메시지는 계속 /api/olivia/messages에 저장되므로(saveToDb) 기록 자체는 유지된다 — 플로팅
  // 위젯 등 다른 곳에서 이어서 볼 수 있고, 나중에 "대화 기록 보기" 같은 진입점을 따로 만들 수도 있다.

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const createLocalMessage = (message: Omit<Message, "clientRequestId" | "createdAt">): Message => ({
    ...message,
    clientRequestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });

  const saveToDb = (msgs: Message[]) => {
    if (!msgs.length) return;
    fetch("/api/olivia/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: msgs.map((m) => ({
          role: m.role,
          content: m.content,
          source: "web",
          metadata: { deviceId: deviceIdRef.current, clientRequestId: m.clientRequestId },
        })),
      }),
    }).catch(() => {});
  };

  const appendAndSave = (message: Omit<Message, "clientRequestId" | "createdAt">) => {
    const localMessage = createLocalMessage(message);
    setMessages((previous) => [...previous, localMessage]);
    saveToDb([localMessage]);
    return localMessage;
  };

  const runTool = async (tool: { name: string; input: any; id: string }) => {
    const res = await fetch("/api/olivia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingTool: tool }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.toolResult;
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const newMsg = createLocalMessage({ role: "user", content: text, source: "web" });
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);
    saveToDb([newMsg]);

    try {
      const apiMessages = updated
        .filter((m) => !m.toolRequest || m.isApproved !== undefined)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, pageContext: "[현재 페이지: 홈]" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      if (data.type === "tool_request") {
        const tools: { name: string; input: any; id: string }[] =
          Array.isArray(data.tools) && data.tools.length ? data.tools : [data.tool];

        if (data.text) setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);

        for (const tool of tools) {
          const resolver = uiActionResolvers[tool.name];
          const uiAction = resolver ? await resolver(tool.input) : null;
          if (uiAction) {
            executeOliviaAction(uiAction);
            const workspaceLabel = uiAction.type === "OPEN_WORKSPACE" ? workspaceRegistry[uiAction.workspace]?.label : undefined;
            const openedMessage = createLocalMessage({
              role: "assistant",
              content: workspaceLabel ? `${workspaceLabel} 화면을 열었어요. 필요한 내용을 말씀해주시면 바로 반영할게요.` : "화면을 준비했어요.",
              source: "web",
            });
            setMessages((prev) => [...prev, openedMessage]);
            saveToDb([openedMessage]);
            continue;
          }
          if (AUTO_EXECUTE_TOOLS.has(tool.name) || isAutoExecutableClientCreate(tool)) {
            try {
              const result = await runTool(tool);
              dispatchOliviaDataChanged(result);
              if (result.action === "navigate" && result.url) {
                if (result.url.startsWith("http")) window.open(result.url, "_blank");
                else window.location.href = result.url;
              }
              const resultMessage = createLocalMessage({ role: "assistant", content: result.message || "완료됐어요!", source: "web" });
              setMessages((prev) => [...prev, resultMessage]);
              saveToDb([resultMessage]);
              window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
            } catch (e: any) {
              appendAndSave({ role: "assistant", content: "⚠ 실행 중 오류: " + e.message, source: "web" });
            }
          } else {
            setMessages((prev) => [...prev, {
              role: "assistant", content: "", source: "web",
              toolRequest: { name: tool.name, input: tool.input, id: tool.id, label: tool.name },
            }]);
          }
        }
      } else {
        appendAndSave({ role: "assistant", content: data.text || "", source: "web" });
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠ 오류가 발생했어요: " + e.message, source: "web" }]);
    } finally {
      setLoading(false);
    }
  };

  const approveTool = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg.toolRequest) return;
    setLoading(true);
    setMessages((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, isApproved: true } : m)));
    try {
      const result = await runTool(msg.toolRequest);
      dispatchOliviaDataChanged(result);
      if (result.action === "navigate" && result.url) {
        if (result.url.startsWith("http")) window.open(result.url, "_blank");
        else window.location.href = result.url;
      }
      appendAndSave({ role: "assistant", content: result.message || "완료됐어요!", source: "web" });
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠ 실행 중 오류: " + e.message, source: "web" }]);
    } finally {
      setLoading(false);
    }
  };

  const rejectTool = (msgIdx: number) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIdx ? { ...m, isApproved: false } : m)));
    appendAndSave({ role: "assistant", content: "알겠어요! 다른 방법으로 도와드릴까요?", source: "web" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // historyLoaded를 기다렸다가 empty를 판정하면, 서버 렌더/클라이언트 fetch 완료 전까지
  // 잠깐 빈 화면이 보였다가 인사말로 바뀌는 깜빡임이 생긴다 — 메시지가 없으면 항상 인사말부터
  // 보여주고, 히스토리가 로드되면 자연스럽게 실제 대화 목록으로 바뀌게 한다.
  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
      borderRadius: compact ? 18 : 24, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)" as any, border: "1px solid rgba(21,88,85,0.08)",
      boxShadow: "0 12px 40px rgba(20,60,55,0.06)", overflow: "hidden",
    }}>
      {isEmpty && compact ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", padding: "0 20px" }}>
          <span style={{ fontSize: 12.5, color: "#6F7E7A" }}>Olivia에게 무엇이든 물어보세요.</span>
        </div>
      ) : isEmpty ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 32px 8px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#1C2B28" }}>
            무엇이든 물어보세요.
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6F7E7A" }}>
            업무, 아이디어, 일정까지 Olivia가 도와드릴게요.
          </p>
          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 760 }}>
            {SUGGESTED_PROMPTS.map(({ icon: Icon, text, accent }) => (
              <button
                key={text}
                type="button"
                onClick={() => void send(text.replace(/\n/g, " "))}
                style={{
                  flex: 1, minWidth: 0, padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(21,88,85,0.1)",
                  background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 10,
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 9, background: `${accent}14`, color: accent,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon size={15} />
                </span>
                <span style={{ fontSize: 12, color: "#3F4E4B", lineHeight: 1.5, whiteSpace: "pre-line" }}>{text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={messagesRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.map((msg, i) => (
            <div key={msg.id || msg.clientRequestId || i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "82%", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 2, background: "linear-gradient(135deg, #E85D2C, #EB8F22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <OliviaIcon size={13} />
                  </div>
                )}
                {msg.content ? (
                  <div style={{
                    background: msg.role === "user" ? C.teal : "rgba(255,255,255,0.9)",
                    color: msg.role === "user" ? "#fff" : "#1C2B28",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    border: msg.role === "assistant" ? "1px solid rgba(21,88,85,0.08)" : "none",
                  }}>
                    <MarkdownText text={msg.content} isUser={msg.role === "user"} />
                  </div>
                ) : null}
              </div>

              {msg.toolRequest && msg.isApproved === undefined && (
                <div style={{
                  background: C.mint, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "12px 14px", marginTop: 6, marginLeft: 30, maxWidth: "82%",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{TOOL_ICONS[msg.toolRequest.name] || "⚡"}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>{msg.toolRequest.label}</div>
                      <div style={{ fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {summarizeTool(msg.toolRequest.name, msg.toolRequest.input)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <button onClick={() => void approveTool(i)} style={{ flex: 1, height: 32, background: C.teal, color: "#fff", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✓ 실행</button>
                    <button onClick={() => rejectTool(i)} style={{ flex: 1, height: 32, background: "#fff", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
                  </div>
                </div>
              )}
              {msg.toolRequest && msg.isApproved !== undefined && (
                <div style={{ fontSize: 10, color: "#9BB5B0", marginTop: 4, marginLeft: 30 }}>
                  {msg.isApproved ? "✓ 실행됨" : "✗ 취소됨"}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #E85D2C, #EB8F22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={13} color="#fff" fill="#fff" strokeWidth={1} />
              </div>
              <div style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(21,88,85,0.08)", padding: "9px 14px", borderRadius: "14px 14px 14px 4px", fontSize: 12, color: "#6F7E7A" }}>
                생각 중...
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ flexShrink: 0, padding: "14px 20px 20px" }}>
        <div style={{
          borderRadius: 20, background: "#fff", border: "1px solid rgba(21,88,85,0.12)",
          boxShadow: "0 4px 16px rgba(20,60,55,0.06)", padding: "12px 14px 10px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하거나 / 로 명령어를 시작하세요"
              rows={1}
              style={{
                flex: 1, resize: "none", border: "none", outline: "none", background: "transparent",
                fontSize: 13.5, lineHeight: 1.5, fontFamily: "inherit", color: "#1C2B28",
                maxHeight: 120, padding: "4px 0",
              }}
            />
            <button type="button" title="첨부(준비 중)" disabled
              style={{ width: 28, height: 28, flexShrink: 0, border: "none", background: "transparent", color: "#9BB5B0", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Paperclip size={16} />
            </button>
            <button type="button" title="음성 입력(준비 중)" disabled
              style={{ width: 28, height: 28, flexShrink: 0, border: "none", background: "transparent", color: "#9BB5B0", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Mic size={16} />
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim() || loading}
              style={{
                width: 32, height: 32, flexShrink: 0, borderRadius: "50%", border: "none",
                background: input.trim() && !loading ? C.teal : "#D5E4E1",
                color: "#fff", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <ArrowUp size={15} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(21,88,85,0.06)" }}>
            <span style={{ width: 15, height: 15, borderRadius: "50%", background: "linear-gradient(135deg, #E85D2C, #EB8F22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <OliviaIcon size={9} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#3F4E4B" }}>Olivia AI</span>
            <ChevronDown size={12} color="#9BB5B0" />
          </div>
        </div>
      </div>
    </div>
  );
}
