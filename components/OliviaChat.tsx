"use client";
import { useEffect, useRef, useState } from "react";

// ── 타입 ─────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  toolRequest?: { name: string; input: any; id: string; label: string };
  toolResult?: string;
  isApproved?: boolean;
}

const C = {
  teal: "#155855", orange: "#E85D2C",
  bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
  muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

const TOOL_LABELS: Record<string, string> = {
  create_quote:       "견적서 생성",
  create_contract:    "계약서 생성",
  send_file_transfer: "파일 전송 메일 발송",
  create_conti:       "촬영 콘티 생성",
  open_page:          "페이지 이동",
};

const TOOL_ICONS: Record<string, string> = {
  create_quote:       "📋",
  create_contract:    "📝",
  send_file_transfer: "📨",
  create_conti:       "🎬",
  open_page:          "🔗",
};

// 도구 입력 요약
function summarizeTool(name: string, input: any): string {
  switch (name) {
    case "create_quote":
      return `${input.hospitalName || ""}${input.packageId ? " · " + input.packageId : ""}`;
    case "send_file_transfer":
      return `${input.hospitalName || ""} → ${input.toEmail || ""}`;
    case "create_contract":
      return `${input.hospitalName || ""} · ${input.totalAmount ? input.totalAmount.toLocaleString("ko-KR") + "원" : ""}`;
    case "create_conti":
      return `${input.hospitalName || ""} · ${input.dept || ""} · ${input.shootDate || ""}`;
    case "open_page":
      return `/${input.page}`;
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}

interface OliviaChatProps {
  pageContext?: string;
  contextData?: Record<string, string>;
  contiData?: object | null;           // 현재 콘티 전체 데이터
  onContiUpdate?: (data: object) => void; // 콘티 수정 콜백
}

export default function OliviaChat({ pageContext, contextData, contiData, onContiUpdate }: OliviaChatProps = {}) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const GREETING: Message = {
    role: "assistant",
    content: "안녕하세요, 정연호 대표님! 올리비아예요 ✨\n무엇을 도와드릴까요?\n\n예시:\n• \"포토클리닉병원 프리미엄 견적서 만들어줘\"\n• \"오늘 촬영한 원본파일 병원에 전달해줘\"\n• \"포토클리닉병원 콘티 작성해줘\"",
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("olivia_chat");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed); return;
        }
      }
    } catch (e) {}
    setMessages([GREETING]);
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const toSave = messages.map(m => ({
        role: m.role, content: m.content,
        toolResult: m.toolResult, isApproved: m.isApproved,
      }));
      localStorage.setItem("olivia_chat", JSON.stringify(toSave.slice(-50)));
    } catch (e) {}
  }, [messages]);

  // 처음 열 때 인사말
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "안녕하세요, 정연호 대표님! 올리비아예요 ✨\n무엇을 도와드릴까요?\n\n예시:\n• \"ABC병원 프리미엄 견적서 만들어줘\"\n• \"오늘 촬영한 ABC파일 이채안 선생님께 보내줘\"\n• \"ABC병원 콘티 작성해줘\"",
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // ── 메시지 전송 ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const newMsg: Message = { role: "user", content: text };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const apiMessages = updated
        .filter(m => !m.toolRequest || m.isApproved !== undefined)
        .map(m => ({ role: m.role, content: m.content }));

      // 콘티 데이터가 있으면 컨텍스트에 포함
      const contiHint = contiData
        ? `\n\n[현재 편집 중인 콘티 데이터 (JSON)]\n${JSON.stringify(contiData, null, 2)}\n\n콘티 수정 요청 시, 응답 맨 끝에 반드시 다음 형식으로 수정된 전체 콘티를 포함해주세요:\n<CONTI_UPDATE>{"conti":[...],"checklist":[...],"schedule":[...]}</CONTI_UPDATE>`
        : "";

      const contextHint = pageContext
        ? `[현재 페이지: ${pageContext}${contextData ? " / " + Object.entries(contextData).map(([k,v]) => `${k}: ${v}`).join(", ") : ""}]${contiHint}`
        : contiHint || null;

      const res  = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          pageContext: contextHint,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      if (data.type === "tool_request") {
        setMessages(prev => [...prev,
          {
            role: "assistant",
            content: data.text || "",
            toolRequest: {
              name:  data.tool.name,
              input: data.tool.input,
              id:    data.tool.id,
              label: TOOL_LABELS[data.tool.name] || data.tool.name,
            },
          },
        ]);
      } else {
        const rawText: string = data.text || "";

        // 콘티 업데이트 태그 파싱
        const contiMatch = rawText.match(/<CONTI_UPDATE>([\s\S]*?)<\/CONTI_UPDATE>/);
        if (contiMatch && onContiUpdate) {
          try {
            const parsed = JSON.parse(contiMatch[1]);
            onContiUpdate(parsed);
            // 태그 제거한 텍스트만 표시
            const cleanText = rawText.replace(/<CONTI_UPDATE>[\s\S]*?<\/CONTI_UPDATE>/, "").trim();
            setMessages(prev => [...prev, {
              role: "assistant",
              content: cleanText + "\n\n✅ 콘티가 업데이트됐어요!",
            }]);
          } catch {
            setMessages(prev => [...prev, { role: "assistant", content: rawText }]);
          }
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: rawText }]);
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ 오류가 발생했어요: " + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  // ── 도구 승인 ────────────────────────────────────────────
  const approveTool = async (msgIdx: number) => {
    const msg = messages[msgIdx];
    if (!msg.toolRequest) return;
    setLoading(true);

    // 승인 표시
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, isApproved: true } : m
    ));

    try {
      const res  = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingTool: msg.toolRequest }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const result = data.toolResult;

      // 페이지 이동
      if (result.action === "navigate") {
        if (result.url.startsWith("http")) {
          window.open(result.url, "_blank");
        } else {
          window.location.href = result.url;
        }
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: result.message || "완료됐어요!",
        toolResult: result.action,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ 실행 중 오류: " + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  // ── 도구 거절 ────────────────────────────────────────────
  const rejectTool = (msgIdx: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, isApproved: false } : m
    ));
    setMessages(prev => [...prev, { role: "assistant", content: "알겠어요! 다른 방법으로 도와드릴까요?" }]);
  };

  const clearChat = () => {
    try { localStorage.removeItem("olivia_chat"); } catch(e) {}
    setMessages([GREETING]);
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 56, height: 56, borderRadius: "50%",
          background: open
            ? C.orange
            : "linear-gradient(135deg, #155855 0%, #1e7870 100%)",
          border: "none", cursor: "pointer",
          boxShadow: open
            ? "0 6px 20px rgba(232,93,44,.4)"
            : "0 6px 20px rgba(21,88,85,.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, transition: "all .2s",
        }}
        title="올리비아 AI 비서"
      >
        {open ? "✕" : "✨"}
      </button>

      {/* 채팅 패널 */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 24, zIndex: 999,
          width: 380, height: 540,
          background: C.surface, borderRadius: 20,
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 60px rgba(21,88,85,.18), 0 4px 16px rgba(0,0,0,.08)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn .2s ease",
        }}>

          {/* 헤더 */}
          <div style={{
            background: C.teal, padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>✨</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>올리비아</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>PHOTO CLINIC AI 비서</div>
            </div>
            <button onClick={clearChat}
              style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff",
                       padding: "4px 10px", borderRadius: 8, fontSize: 10, cursor: "pointer",
                       fontFamily: "inherit" }}>
              초기화
            </button>
          </div>

          {/* 메시지 목록 */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 14px 0",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i}>
                {/* 메시지 버블 */}
                {msg.content && (
                  <div style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    {msg.role === "assistant" && (
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, marginRight: 6, marginTop: 2,
                      }}>✨</div>
                    )}
                    <div style={{
                      maxWidth: "78%",
                      background: msg.role === "user" ? C.teal : C.bg,
                      color: msg.role === "user" ? "#fff" : C.txt,
                      padding: "9px 13px", borderRadius: msg.role === "user"
                        ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )}

                {/* 도구 승인 카드 */}
                {msg.toolRequest && msg.isApproved === undefined && (
                  <div style={{
                    background: C.mint, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: "12px 14px", marginTop: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>{TOOL_ICONS[msg.toolRequest.name] || "⚡"}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>
                          {msg.toolRequest.label}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {summarizeTool(msg.toolRequest.name, msg.toolRequest.input)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button onClick={() => approveTool(i)}
                        style={{ flex: 1, height: 34, background: C.teal, color: "#fff",
                                 border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700,
                                 cursor: "pointer", fontFamily: "inherit" }}>
                        ✓ 실행
                      </button>
                      <button onClick={() => rejectTool(i)}
                        style={{ flex: 1, height: 34, background: C.surface, color: C.muted,
                                 border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 12,
                                 cursor: "pointer", fontFamily: "inherit" }}>
                        취소
                      </button>
                    </div>
                  </div>
                )}

                {/* 승인/거절 상태 표시 */}
                {msg.toolRequest && msg.isApproved !== undefined && (
                  <div style={{ fontSize: 10, color: C.hint, marginTop: 4, marginLeft: 28 }}>
                    {msg.isApproved ? "✓ 실행됨" : "✗ 취소됨"}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                }}>✨</div>
                <div style={{
                  background: C.bg, padding: "9px 14px", borderRadius: "14px 14px 14px 4px",
                  fontSize: 12, color: C.hint,
                }}>
                  <span style={{ animation: "pulse 1.2s infinite" }}>생각 중...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* 입력창 */}
          <div style={{
            padding: "10px 12px",
            borderTop: `1px solid ${C.border}`,
            display: "flex", gap: 8, alignItems: "flex-end",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={"무엇이 필요하세요?\n(⌘+Enter로 전송)"}
              disabled={loading}
              rows={1}
              style={{
                flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "9px 13px", fontSize: 12, fontFamily: "inherit",
                background: C.bg, color: C.txt, outline: "none",
                resize: "none", lineHeight: 1.6, maxHeight: 120, overflowY: "auto",
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{
                width: 38, height: 38, background: input.trim() ? C.orange : C.border,
                border: "none", borderRadius: 10, cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, transition: "background .15s", marginBottom: 1,
              }}>
              ➤
            </button>
          </div>

        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
      `}</style>
    </>
  );
}
