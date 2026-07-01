"use client";
import { useEffect, useRef, useState } from "react";

// ── 마크다운 렌더러 (외부 패키지 없이 직접 구현) ─────────────
function MarkdownText({ text, isUser }: { text: string; isUser: boolean }) {
  const color = isUser ? "#fff" : "#1C2B28";
  const mutedColor = isUser ? "rgba(255,255,255,0.75)" : "#5A7470";
  const borderColor = isUser ? "rgba(255,255,255,0.3)" : "#C8DDD9";
  const codeBg = isUser ? "rgba(255,255,255,0.15)" : "#EDF5F3";
  const linkColor = isUser ? "#fff" : "#155855";

  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let i = 0;

  const parseInline = (line: string, key: string | number): React.ReactNode => {
    // bold + italic, bold, italic, inline code, link
    const parts = line.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    return (
      <span key={key}>
        {parts.map((p, pi) => {
          if (p.startsWith("***") && p.endsWith("***"))
            return <strong key={pi}><em>{p.slice(3, -3)}</em></strong>;
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={pi} style={{ fontWeight: 900 }}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*"))
            return <em key={pi}>{p.slice(1, -1)}</em>;
          if (p.startsWith("`") && p.endsWith("`"))
            return <code key={pi} style={{ background: codeBg, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: "0.9em" }}>{p.slice(1, -1)}</code>;
          const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch)
            return <a key={pi} href={linkMatch[2]} target="_blank" rel="noreferrer" style={{ color: linkColor, textDecoration: "underline" }}>{linkMatch[1]}</a>;
          return p;
        })}
      </span>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // 빈 줄
    if (line.trim() === "") { result.push(<div key={i} style={{ height: 6 }} />); i++; continue; }

    // 코드 블록
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      result.push(
        <pre key={i} style={{ background: codeBg, border: `1px solid ${borderColor}`, borderRadius: 8, padding: "10px 12px", overflowX: "auto", margin: "6px 0", fontSize: "11px", lineHeight: 1.6 }}>
          <code style={{ fontFamily: "monospace", color }}>{codeLines.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }

    // 구분선
    if (/^---+$/.test(line.trim())) {
      result.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${borderColor}`, margin: "8px 0" }} />);
      i++; continue;
    }

    // 제목 h1~h3
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) { result.push(<div key={i} style={{ fontSize: "15px", fontWeight: 900, color, margin: "8px 0 4px" }}>{parseInline(h1[1], "t")}</div>); i++; continue; }
    if (h2) { result.push(<div key={i} style={{ fontSize: "13px", fontWeight: 900, color, margin: "6px 0 3px" }}>{parseInline(h2[1], "t")}</div>); i++; continue; }
    if (h3) { result.push(<div key={i} style={{ fontSize: "12px", fontWeight: 800, color: mutedColor, margin: "5px 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{parseInline(h3[1], "t")}</div>); i++; continue; }

    // 순서 있는 목록
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      result.push(
        <ol key={i} style={{ paddingLeft: 18, margin: "4px 0" }}>
          {items.map((item, idx) => <li key={idx} style={{ fontSize: "12px", lineHeight: 1.7, color }}>{parseInline(item, idx)}</li>)}
        </ol>
      );
      continue;
    }

    // 순서 없는 목록
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      result.push(
        <ul key={i} style={{ paddingLeft: 16, margin: "4px 0", listStyle: "none" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ fontSize: "12px", lineHeight: 1.7, color, display: "flex", gap: 6 }}>
              <span style={{ color: "#E85D2C", flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{parseInline(item, idx)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 인용문
    if (line.startsWith(">")) {
      result.push(
        <div key={i} style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 10, margin: "4px 0", color: mutedColor, fontSize: "12px", fontStyle: "italic" }}>
          {parseInline(line.slice(1).trim(), i)}
        </div>
      );
      i++; continue;
    }

    // 일반 텍스트
    result.push(<div key={i} style={{ fontSize: "12px", lineHeight: 1.7, color }}>{parseInline(line, i)}</div>);
    i++;
  }

  return <>{result}</>;
}

// ── 올리비아 여성 아이콘 ──────────────────────────────────────
function OliviaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 긴 머리 — 왼쪽 */}
      <path d="M8 22C7.5 18 7 15 7 12.5C6.5 11 6.5 9.5 7 8C8 5.5 9.8 4 12 4"
        fill="rgba(255,255,255,0.55)" />
      {/* 긴 머리 — 오른쪽 */}
      <path d="M16 22C16.5 18 17 15 17 12.5C17.5 11 17.5 9.5 17 8C16 5.5 14.2 4 12 4"
        fill="rgba(255,255,255,0.55)" />
      {/* 머리카락 윗부분 (볼륨) */}
      <path d="M8.5 11.5C9 7.5 10.3 5.5 12 5.5C13.7 5.5 15 7.5 15.5 11.5C14.2 9.5 13.2 9 12 9C10.8 9 9.8 9.5 8.5 11.5Z"
        fill="rgba(255,255,255,0.95)" />
      {/* 얼굴 */}
      <ellipse cx="12" cy="12.5" rx="3.6" ry="3.9" fill="rgba(255,255,255,0.97)" />
      {/* 목 */}
      <path d="M10.8 16.2C10.8 16.2 11.2 17 12 17C12.8 17 13.2 16.2 13.2 16.2"
        fill="rgba(255,255,255,0.85)" />
      {/* 어깨 (우아한 곡선) */}
      <path d="M3.5 23.5C3.5 19.5 7 17.5 12 17.5C17 17.5 20.5 19.5 20.5 23.5"
        fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

// ── 타입 ─────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  source?: "web" | "telegram";
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
  create_quote:        "견적서 생성",
  create_contract:     "계약서 생성",
  send_file_transfer:  "파일 전송 메일 발송",
  create_conti:        "촬영 콘티 생성",
  open_page:           "페이지 이동",
  calendar_add:        "캘린더 일정 추가",
  calendar_add_bulk:   "캘린더 일정 일괄 추가",
  calendar_list:       "캘린더 일정 조회",
  calendar_complete:   "일정 완료 처리",
  calendar_delete:     "일정 삭제",
  calendar_update:     "일정 수정",
};

const TOOL_ICONS: Record<string, string> = {
  create_quote:        "📋",
  create_contract:     "📝",
  send_file_transfer:  "📨",
  create_conti:        "🎬",
  open_page:           "🔗",
  calendar_add:        "📅",
  calendar_add_bulk:   "📅",
  calendar_list:       "🗓️",
  calendar_complete:   "✅",
  calendar_delete:     "🗑️",
  calendar_update:     "✏️",
};

// 캘린더 도구는 승인 없이 자동 실행
const AUTO_EXECUTE_TOOLS = new Set([
  "calendar_add", "calendar_add_bulk", "calendar_list",
  "calendar_complete", "calendar_delete", "calendar_update", "open_page",
]);

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

const GREETING: Message = {
  role: "assistant",
  content: "안녕하세요, 정연호 대표님. 올리비아예요.\n월간 포토클리닉 구독 운영을 도와드릴게요.\n\n예시:\n• \"온유성형외과 이번 달 콘텐츠 추천해줘\"\n• \"리포트 코멘트 작성해줘\"\n• \"촬영 콘티로 이동해줘\"\n• \"파일 전송 메일 작성해줘\"",
};

interface OliviaChatProps {
  pageContext?: string;
  contextData?: Record<string, string>;
  contiData?: object | null;
  onContiUpdate?: (data: object) => void;
}

export default function OliviaChat({ pageContext, contextData, contiData, onContiUpdate }: OliviaChatProps = {}) {
  const [open,            setOpen]           = useState(false);
  const [messages,        setMessages]       = useState<Message[]>([GREETING]);
  const [input,           setInput]          = useState("");
  const [loading,         setLoading]        = useState(false);
  const [isAuthenticated, setIsAuthenticated]= useState(false);
  const [isAuthReady,     setIsAuthReady]    = useState(false);
  const [unreadCount,     setUnreadCount]    = useState(0);
  const [isMobile,        setIsMobile]       = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const messagesRef    = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const lastPollRef    = useRef<string>(new Date().toISOString());
  const pendingRef     = useRef<Message[]>([]);

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check();
    window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  const quickPrompts = [
    "내일 오후 3시 상담 미팅 추가해줘",
    "오늘 일정 보여줘",
    "이번 달 콘텐츠 추천해줘",
    "부족한 콘텐츠 찾아줘",
    "인스타 캡션 만들어줘",
    "월간 리포트 코멘트 작성해줘",
    "촬영 콘티로 이동해줘",
    "파일 전송 메일 작성해줘",
  ];

  // ── DB 저장 헬퍼 (fire-and-forget) ─────────────────────
  const saveToDb = (msgs: Array<{ role: "user" | "assistant"; content: string }>) => {
    if (!msgs.length) return;
    fetch("/api/olivia/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs.map(m => ({ ...m, source: "web" })) }),
    }).catch(() => {});
  };

  // ── 인증 확인 ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/check")
      .then(res => res.json())
      .then(data => setIsAuthenticated(Boolean(data.authenticated)))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsAuthReady(true));
  }, []);

  // ── 메시지 초기 로드 (DB → localStorage 폴백) ──────────
  useEffect(() => {
    if (!isAuthReady || !isAuthenticated) return;

    const fallback = () => {
      try {
        const saved = localStorage.getItem("olivia_chat");
        const parsed = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      } catch {}
    };

    fetch("/api/olivia/messages?limit=80")
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.messages?.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            role:    m.role as "user" | "assistant",
            content: m.content,
            source:  m.source as "web" | "telegram" | undefined,
          })));
          lastPollRef.current = data.messages[data.messages.length - 1].created_at;
        } else {
          fallback();
        }
      })
      .catch(fallback);
  }, [isAuthReady, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 스크롤 자동 이동 (컨테이너 직접 제어) ──────────────
  const scrollToBottom = (smooth = true) => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, loading]);

  // ── 열릴 때 포커스 + 대기 중 텔레그램 메시지 플러시 ────
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 300);
    if (pendingRef.current.length > 0) {
      setMessages(prev => [...prev, ...pendingRef.current]);
      pendingRef.current = [];
    }
    setUnreadCount(0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 텔레그램 메시지 폴링 (열림: 5초, 닫힘: 20초) ───────
  useEffect(() => {
    if (!isAuthenticated) return;

    const poll = async () => {
      try {
        const since = encodeURIComponent(lastPollRef.current);
        const res   = await fetch(`/api/olivia/messages?source=telegram&since=${since}&limit=20`);
        const data  = await res.json();
        if (!data.ok || !data.messages?.length) return;

        const newMsgs: Message[] = data.messages.map((m: any) => ({
          role:    m.role as "user" | "assistant",
          content: m.content,
          source:  "telegram" as const,
        }));
        lastPollRef.current = data.messages[data.messages.length - 1].created_at;

        if (open) {
          setMessages(prev => [...prev, ...newMsgs]);
        } else {
          pendingRef.current.push(...newMsgs);
          setUnreadCount(c => c + newMsgs.filter(m => m.role === "user").length);
        }
      } catch {}
    };

    const id = setInterval(poll, open ? 5000 : 20000);
    return () => clearInterval(id);
  }, [open, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 메시지 전송 ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const newMsg: Message = { role: "user", content: text, source: "web" };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);
    saveToDb([{ role: "user", content: text }]);

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
        : `[현재 페이지: 월간 포토클리닉 구독 콘텐츠 운영 시스템]${contiHint}`;

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
        const toolName = data.tool.name as string;

        if (AUTO_EXECUTE_TOOLS.has(toolName)) {
          // 캘린더 도구: 승인 없이 즉시 실행
          if (data.text) {
            setMessages(prev => [...prev, { role: "assistant", content: data.text }]);
          }
          try {
            const execRes = await fetch("/api/olivia", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pendingTool: data.tool }),
            });
            let execData: any;
            try { execData = await execRes.json(); } catch { throw new Error("서버 응답을 처리할 수 없어요. 잠시 후 다시 시도해주세요."); }
            if (!execData.ok) throw new Error(execData.error);
            const result = execData.toolResult;
            const resultMsg = result.message || "완료됐어요!";
            if (result.action === "navigate" && result.url) {
              if (result.url.startsWith("http")) window.open(result.url, "_blank");
              else window.location.href = result.url;
            }
            setMessages(prev => [...prev, {
              role: "assistant", content: resultMsg, source: "web", toolResult: "done",
            }]);
            saveToDb([{ role: "assistant", content: resultMsg }]);
            window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
          } catch (e: any) {
            const errMsg = "⚠ 캘린더 오류: " + e.message;
            setMessages(prev => [...prev, { role: "assistant", content: errMsg, source: "web" }]);
            saveToDb([{ role: "assistant", content: errMsg }]);
          }
        } else {
          // 일반 도구: 승인 카드 표시
          setMessages(prev => [...prev, {
            role: "assistant",
            content: data.text || "",
            source: "web",
            toolRequest: {
              name:  data.tool.name,
              input: data.tool.input,
              id:    data.tool.id,
              label: TOOL_LABELS[data.tool.name] || data.tool.name,
            },
          }]);
        }
      } else {
        const rawText: string = data.text || "";

        // 콘티 업데이트 태그 파싱
        const contiMatch = rawText.match(/<CONTI_UPDATE>([\s\S]*?)<\/CONTI_UPDATE>/);
        let displayText = rawText;
        if (contiMatch && onContiUpdate) {
          try {
            const parsed = JSON.parse(contiMatch[1]);
            onContiUpdate(parsed);
            displayText = rawText.replace(/<CONTI_UPDATE>[\s\S]*?<\/CONTI_UPDATE>/, "").trim() + "\n\n✅ 콘티가 업데이트됐어요!";
          } catch {}
        }
        setMessages(prev => [...prev, { role: "assistant", content: displayText, source: "web" }]);
        saveToDb([{ role: "assistant", content: displayText }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ 오류가 발생했어요: " + e.message, source: "web" }]);
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

      const resultMsg = result.message || "완료됐어요!";
      setMessages(prev => [...prev, {
        role: "assistant", content: resultMsg, source: "web", toolResult: result.action,
      }]);
      saveToDb([{ role: "assistant", content: resultMsg }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ 실행 중 오류: " + e.message, source: "web" }]);
    } finally {
      setLoading(false);
    }
  };

  // ── 도구 거절 ────────────────────────────────────────────
  const rejectTool = (msgIdx: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, isApproved: false } : m
    ));
    const rejectMsg = "알겠어요! 다른 방법으로 도와드릴까요?";
    setMessages(prev => [...prev, { role: "assistant", content: rejectMsg, source: "web" }]);
    saveToDb([{ role: "assistant", content: rejectMsg }]);
  };

  const clearChat = () => {
    try { localStorage.removeItem("olivia_chat"); } catch {}
    fetch("/api/olivia/messages", { method: "DELETE" }).catch(() => {});
    lastPollRef.current = new Date().toISOString();
    pendingRef.current  = [];
    setUnreadCount(0);
    setMessages([GREETING]);
  };

  if (!isAuthReady || !isAuthenticated) return null;

  return (
    <>
      {/* 플로팅 버튼 — 모바일 전체화면 채팅 중에는 숨김 */}
      {!(open && isMobile) && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: "fixed",
            bottom: isMobile ? 20 : 24,
            right: isMobile ? 16 : 24,
            zIndex: 1000,
            width: isMobile ? 52 : 56,
            height: isMobile ? 52 : 56,
            borderRadius: "50%",
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
          {!open && unreadCount > 0 && (
            <div style={{
              position: "absolute", top: -4, right: -4,
              width: 20, height: 20, borderRadius: "50%",
              background: "#FF3B30", color: "#fff",
              fontSize: 10, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #fff", lineHeight: 1,
            }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </button>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div style={isMobile ? {
          // 모바일: 전체화면 슬라이드업
          position: "fixed", inset: 0, zIndex: 999,
          background: C.surface,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "slideUpChat .25s cubic-bezier(.32,.72,0,1)",
        } : {
          // 데스크탑: 기존 방식
          position: "fixed", bottom: 92, right: 24, zIndex: 999,
          width: 420, height: 580,
          background: C.surface, borderRadius: 20,
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 60px rgba(21,88,85,.18), 0 4px 16px rgba(0,0,0,.08)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn .2s ease",
        }}>

          {/* 헤더 */}
          <div style={{
            background: C.teal, padding: isMobile ? "12px 14px" : "14px 18px",
            display: "flex", alignItems: "center", gap: 10,
            flexShrink: 0,
          }}>
            {isMobile && (
              <button onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff",
                         width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer",
                         display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                ←
              </button>
            )}
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>✨</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>올리비아</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>월간 포토클리닉 운영 비서</div>
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
                    display: "flex", flexDirection: "column",
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      {msg.role === "assistant" && (
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                          background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, marginRight: 6, marginTop: 2,
                        }}>
                          <OliviaIcon size={14} />
                        </div>
                      )}
                      <div style={{
                        maxWidth: "78%",
                        background: msg.role === "user" ? C.teal : C.bg,
                        color: msg.role === "user" ? "#fff" : C.txt,
                        padding: "9px 13px", borderRadius: msg.role === "user"
                          ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        fontSize: 12, lineHeight: 1.7,
                      }}>
                        <MarkdownText text={msg.content} isUser={msg.role === "user"} />
                      </div>
                    </div>
                    {msg.source === "telegram" && (
                      <div style={{
                        fontSize: 9, color: C.hint, marginTop: 2,
                        paddingLeft: msg.role === "assistant" ? 30 : 0,
                      }}>
                        📱 텔레그램
                      </div>
                    )}
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
                  fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 7,
                }}>
                  <span style={{ animation: "pulse 1.2s infinite" }}>생각 중</span>
                  <span style={{ display: "flex", gap: 3 }}>
                    {[0,1,2].map(j => (
                      <span key={j} style={{
                        display: "inline-block", width: 4, height: 4, borderRadius: "50%",
                        background: C.teal, opacity: 0.6,
                        animation: `bounce 1s ease-in-out ${j*0.18}s infinite`,
                      }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* 입력창 */}
          <div style={{
            borderTop: `1px solid ${C.border}`,
            padding: "9px 12px 0",
            display: "flex",
            gap: 6,
            overflowX: "auto",
          }}>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                style={{
                  flex: "0 0 auto",
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  background: C.mint,
                  color: C.teal,
                  padding: "6px 9px",
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div style={{
            padding: "10px 12px",
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
        @keyframes slideUpChat { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
      `}</style>
    </>
  );
}
