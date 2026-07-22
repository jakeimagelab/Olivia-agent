"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { C } from "@/lib/theme";
import OliviaChatWorkItemCard from "@/components/olivia/OliviaChatWorkItemCard";
import { compactWorkItemReferences, type OliviaChatWorkItem, type OliviaChatWorkItemAction } from "@/lib/olivia/chatTypes";
import { mergeChatMessages } from "@/lib/olivia/chatMessageMerge";
import { isAutoExecutableClientCreate } from "@/lib/olivia/crud/autoExecution";

// ── 코드 블록 (복사 버튼 포함, 개발요청 스펙 등을 그대로 복사해 전달할 때 사용) ──
function CodeBlock({ code, bg, border, color }: { code: string; bg: string; border: string; color: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div style={{ position: "relative", margin: "6px 0" }}>
      <pre style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "10px 12px", paddingTop: 30, overflowX: "auto", margin: 0, fontSize: "11px", lineHeight: 1.6 }}>
        <code style={{ fontFamily: "monospace", color }}>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        style={{ position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: "pointer" }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

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
        <CodeBlock key={i} code={codeLines.join("\n")} bg={codeBg} border={borderColor} color={color} />
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

// ── 올리비아 아이콘 — 오렌지 그라디언트 배지 위 흰색 스파클 (헤더/토글 버튼과 동일 디자인) ──
function OliviaIcon({ size = 20 }: { size?: number }) {
  return <Sparkles size={size} color="#fff" fill="#fff" strokeWidth={1} />;
}

// ── 타입 ─────────────────────────────────────────────────
interface Message {
  id?: string;
  clientRequestId?: string;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  source?: "web" | "telegram";
  toolRequest?: { name: string; input: any; id: string; label: string };
  toolResult?: string;
  isApproved?: boolean;
  workItems?: OliviaChatWorkItem[];
}

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
  get_today_briefing:  "오늘의 업무 확인",
  get_urgent_insights: "긴급 인사이트 확인",
  search_client_projects: "고객·프로젝트 검색",
  get_project_status:  "프로젝트 현황 확인",
  list_pending_approvals: "승인 대기 확인",
  list_commitments:    "약속 확인",
  prepare_followup:    "고객 후속 연락 준비",
  manage_olivia_action:"Olivia 업무 처리",
  run_observer:        "최신 업무 재점검",
  list_upcoming_meetings: "예정 고객 미팅 확인",
  link_meeting_client: "미팅 고객 연결",
  prepare_meeting_brief: "미팅 전 브리핑 준비",
  analyze_meeting_memo: "미팅 메모 분석",
  complete_meeting: "미팅 완료 처리",
  get_meeting_followups: "미팅 후속 업무 확인",
  create_feature_record: "기능 데이터 생성",
  update_feature_record: "기능 데이터 수정",
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
  get_today_briefing:  "☀️",
  get_urgent_insights: "🚨",
  search_client_projects: "🔎",
  get_project_status:  "📍",
  list_pending_approvals: "✅",
  list_commitments:    "🤝",
  prepare_followup:    "✉️",
  manage_olivia_action:"⚡",
  run_observer:        "✨",
  list_upcoming_meetings: "🗓️",
  link_meeting_client: "🔗",
  prepare_meeting_brief: "📋",
  analyze_meeting_memo: "🎙️",
  complete_meeting: "✅",
  get_meeting_followups: "🤝",
  create_feature_record: "＋",
  update_feature_record: "✎",
};

// 페이지 이동만 하거나(DB 기록 없음), 조회이거나, 내부 상태 변경인 도구는 승인 없이 자동 실행.
// 고객에게 실제 이메일이 나가는 send_file_transfer/send_workflow_mail/send_mailing은 되돌릴 수
// 없는 행동이라 승인 카드로 남겨둔다.
const AUTO_EXECUTE_TOOLS = new Set([
  "calendar_add", "calendar_add_bulk", "calendar_list",
  "calendar_complete", "calendar_delete", "calendar_update", "open_page",
  "get_today_briefing", "get_urgent_insights", "search_client_projects",
  "get_project_status", "list_pending_approvals", "list_commitments",
  "prepare_followup", "run_observer",
  "list_upcoming_meetings", "prepare_meeting_brief",
  "analyze_meeting_memo", "complete_meeting", "get_meeting_followups",
  "create_quote", "create_contract", "create_website", "create_conti",
  "get_workflow_status", "advance_workflow_step",
  "get_gallery", "create_gallery", "list_mailing_queue",
  "memo_add", "manage_olivia_action", "link_meeting_client",
  "check_recent_errors", "generate_document", "generate_dev_request",
]);

const CRUD_FIELD_LABELS: Record<string, string> = {
  hospitalName: "고객", clientName: "고객", projectName: "프로젝트", title: "제목",
  contactName: "담당자", phone: "전화", email: "이메일", specialty: "진료과",
  date: "날짜", time: "시간", shootDate: "촬영일", quoteNumber: "견적번호",
  totalAmount: "합계", nasLink: "NAS", subject: "메일 제목", status: "상태",
};

function summarizeCrudData(input: any) {
  const prefix = input.target?.name || input.target?.naturalKey || input.target?.id;
  const fields = Object.entries(input.data || {}).slice(0, 5).map(([key, value]) => {
    const printable = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `${CRUD_FIELD_LABELS[key] || key}: ${printable.slice(0, 48)}`;
  });
  return [`${input.domain || "기능"}${prefix ? ` · 대상: ${prefix}` : ""}`, ...fields].join("\n");
}

function dispatchOliviaDataChanged(result: any) {
  if (!result?.domain || !result?.operation || !result?.recordId) return;
  window.dispatchEvent(new CustomEvent("olivia-data-changed", {
    detail: { domain: result.domain, operation: result.operation, recordId: result.recordId },
  }));
}

// 도구 입력 요약
function summarizeTool(name: string, input: any): string {
  switch (name) {
    case "create_feature_record":
      return summarizeCrudData(input);
    case "update_feature_record":
      return summarizeCrudData(input);
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
  content: "안녕하세요, 정연호 대표님. 올리비아예요.\n오늘의 운영 상황을 확인하고 필요한 업무를 준비해드릴게요.\n\n예시:\n• \"오늘 가장 급한 일 알려줘\"\n• \"승인 대기 항목 보여줘\"\n• \"오블리브 프로젝트 상황 알려줘\"\n• \"첫 번째 고객 후속 연락 준비해줘\"",
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
  const [workItemBusy,    setWorkItemBusy]   = useState<string | null>(null);
  const [panelSize,       setPanelSize]      = useState({ width: 420, height: 580 });
  const [panelPreset,     setPanelPreset]    = useState<"small" | "medium" | "full" | "custom">("small");

  const resizeStartRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // 패널이 우측 하단에 고정돼 있으므로, 좌상단 모서리를 드래그하면 그 방향으로 커지도록 계산한다.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { startX: e.clientX, startY: e.clientY, startW: panelSize.width, startH: panelSize.height };

    const onMove = (ev: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = start.startX - ev.clientX;
      const dy = start.startY - ev.clientY;
      const maxW = window.innerWidth - 48;
      const maxH = window.innerHeight - 116;
      setPanelSize({
        width: Math.min(maxW, Math.max(320, start.startW + dx)),
        height: Math.min(maxH, Math.max(400, start.startH + dy)),
      });
      setPanelPreset("custom");
    };
    const onUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const applyPanelPreset = (preset: "small" | "medium" | "full") => {
    const availableWidth = Math.max(320, window.innerWidth - 48);
    const availableHeight = Math.max(400, window.innerHeight - 116);
    const sizes = {
      small: { width: Math.min(420, availableWidth), height: Math.min(580, availableHeight) },
      medium: { width: Math.min(680, availableWidth), height: Math.min(740, availableHeight) },
      full: { width: availableWidth, height: availableHeight },
    };
    setPanelSize(sizes[preset]);
    setPanelPreset(preset);
  };

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
    "오늘 가장 급한 일 알려줘",
    "승인 대기 항목 보여줘",
    "대표 약속 확인해줘",
    "최신 업무 상태 다시 확인해줘",
    "오늘 고객 미팅 알려줘",
    "내일 미팅 준비해줘",
  ];

  // 이 브라우저 탭을 식별하는 ID — 다른 기기(맥스튜디오/노트북)의 폴링과 내가 방금
  // 보낸 메시지를 구분해, 내가 보낸 메시지가 폴링으로 다시 돌아와 중복 표시되지 않게 한다.
  const deviceIdRef = useRef<string>("");
  if (!deviceIdRef.current) {
    deviceIdRef.current = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ── DB 저장 헬퍼 (fire-and-forget) ─────────────────────
  const saveToDb = (msgs: Message[]) => {
    if (!msgs.length) return;
    fetch("/api/olivia/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs.map(m => ({
        role: m.role,
        content: m.content,
        source: "web",
        metadata: { ...(m.workItems?.length ? { workItems: compactWorkItemReferences(m.workItems) } : {}), deviceId: deviceIdRef.current, clientRequestId: m.clientRequestId },
      })) }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok || !Array.isArray(data.messages)) return;
        const persisted = data.messages.map((row: any, index: number) => ({
          ...msgs[index],
          id: row.id,
          createdAt: row.created_at,
          source: row.source || msgs[index]?.source || "web",
        })).filter((message: Message) => message.id);
        if (persisted.length) setMessages((previous) => mergeChatMessages(previous, persisted));
      })
      .catch(() => {});
  };

  const createLocalMessage = (message: Omit<Message, "clientRequestId" | "createdAt">): Message => ({
    ...message,
    clientRequestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });

  const appendAndSave = (message: Omit<Message, "clientRequestId" | "createdAt">) => {
    const localMessage = createLocalMessage(message);
    setMessages((previous) => [...previous, localMessage]);
    saveToDb([localMessage]);
    return localMessage;
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
            id:      m.id,
            createdAt: m.created_at,
            clientRequestId: m.metadata?.clientRequestId,
            role:    m.role as "user" | "assistant",
            content: m.content,
            source:  m.source as "web" | "telegram" | undefined,
            workItems: Array.isArray(m.metadata?.workItems) ? m.metadata.workItems.map((item: any) => ({ ...item, summary: item.summary || "저장된 업무 항목", availableActions: item.availableActions || ["view"] })) : undefined,
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

  // ── 열릴 때 포커스 + 대기 중 텔레그램 메시지 플러시 + 맨 아래 이동 ────
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 300);
    // 패널이 DOM에 마운트된 직후 즉시 맨 아래로 이동
    setTimeout(() => scrollToBottom(false), 50);
    if (pendingRef.current.length > 0) {
      setMessages(prev => mergeChatMessages(prev, pendingRef.current));
      pendingRef.current = [];
    }
    setUnreadCount(0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 다른 기기/텔레그램 메시지 폴링 (열림: 5초, 닫힘: 20초) ───────
  // 맥스튜디오·노트북·텔레그램 어디서든 하나의 대화로 보이도록 소스 구분 없이 폴링하고,
  // 이 탭이 방금 보낸 메시지는(deviceId로 식별) 중복 표시되지 않게 제외한다.
  useEffect(() => {
    if (!isAuthenticated) return;

    const poll = async () => {
      try {
        const since = encodeURIComponent(lastPollRef.current);
        const res   = await fetch(`/api/olivia/messages?since=${since}&limit=20`);
        const data  = await res.json();
        if (!data.ok || !data.messages?.length) return;

        lastPollRef.current = data.messages[data.messages.length - 1].created_at;

        const newMsgs: Message[] = data.messages
          .filter((m: any) => m.metadata?.deviceId !== deviceIdRef.current)
          .map((m: any) => ({
            id:      m.id,
            createdAt: m.created_at,
            clientRequestId: m.metadata?.clientRequestId,
            role:    m.role as "user" | "assistant",
            content: m.content,
            source:  (m.source as "web" | "telegram") ?? "web",
            workItems: Array.isArray(m.metadata?.workItems) ? m.metadata.workItems.map((item: any) => ({ ...item, summary: item.summary || "저장된 업무 항목", availableActions: item.availableActions || ["view"] })) : undefined,
          }));
        if (!newMsgs.length) return;

        if (open) {
          setMessages(prev => mergeChatMessages(prev, newMsgs));
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

    const newMsg = createLocalMessage({ role: "user", content: text, source: "web" });
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);
    saveToDb([newMsg]);

    try {
      const apiMessages = updated
        .filter(m => !m.toolRequest || m.isApproved !== undefined)
        .map(m => ({ role: m.role, content: m.content }));
      const recentWorkItems = compactWorkItemReferences(
        updated.flatMap((message) => message.workItems || []).slice(-12),
      );

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
          recentWorkItems,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      if (data.type === "tool_request") {
        // 클로드가 한 응답에서 독립적인 여러 작업을 한 번에 요청(병렬 tool_use)할 수 있다.
        // 이전엔 첫 번째 도구만 처리해서 나머지 요청이 조용히 버려지고 사용자가 다시
        // 요청해야 했다 — 응답에 담긴 도구를 전부 순서대로 처리한다.
        const tools: { name: string; input: any; id: string }[] =
          Array.isArray(data.tools) && data.tools.length ? data.tools : [data.tool];

        if (data.text) {
          setMessages(prev => [...prev, { role: "assistant", content: data.text }]);
        }

        for (const tool of tools) {
          const toolName = tool.name as string;
          if (AUTO_EXECUTE_TOOLS.has(toolName) || isAutoExecutableClientCreate(tool)) {
            // 안전한 도구와 명시적으로 요청한 신규 고객 등록은 즉시 실행
            try {
              const execRes = await fetch("/api/olivia", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pendingTool: tool, recentWorkItems }),
              });
              let execData: any;
              try { execData = await execRes.json(); } catch { throw new Error("서버 응답을 처리할 수 없어요. 잠시 후 다시 시도해주세요."); }
              if (!execData.ok) throw new Error(execData.error);
              const result = execData.toolResult;
              const resultMsg = result.message || "완료됐어요!";
              dispatchOliviaDataChanged(result);
              if (result.action === "navigate" && result.url) {
                if (result.url.startsWith("http")) window.open(result.url, "_blank");
                else window.location.href = result.url;
              }
              const resultMessage = createLocalMessage({
                role: "assistant", content: resultMsg, source: "web", toolResult: "done",
                workItems: result.workItems,
              });
              setMessages(prev => [...prev, resultMessage]);
              saveToDb([resultMessage]);
              window.dispatchEvent(new CustomEvent("olivia-calendar-updated"));
            } catch (e: any) {
              const errMsg = "⚠ 실행 중 오류: " + e.message;
              appendAndSave({ role: "assistant", content: errMsg, source: "web" });
            }
          } else {
            // 일반 도구: 승인 카드 표시 (도구별로 각각 하나씩)
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "",
              source: "web",
              toolRequest: {
                name:  tool.name,
                input: tool.input,
                id:    tool.id,
                label: TOOL_LABELS[tool.name] || tool.name,
              },
            }]);
          }
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
        appendAndSave({ role: "assistant", content: displayText, source: "web" });
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
        body: JSON.stringify({
          pendingTool: msg.toolRequest,
          recentWorkItems: compactWorkItemReferences(messages.flatMap((message) => message.workItems || []).slice(-12)),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const result = data.toolResult;

      dispatchOliviaDataChanged(result);

      // 페이지 이동
      if (result.action === "navigate") {
        if (result.url.startsWith("http")) {
          window.open(result.url, "_blank");
        } else {
          window.location.href = result.url;
        }
      }

      const resultMsg = result.message || "완료됐어요!";
      appendAndSave({
        role: "assistant", content: resultMsg, source: "web", toolResult: result.action,
        workItems: result.workItems,
      });
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
    appendAndSave({ role: "assistant", content: rejectMsg, source: "web" });
  };

  const handleWorkItemAction = async (item: OliviaChatWorkItem, action: OliviaChatWorkItemAction) => {
    if (action === "view") {
      if (item.workflowRunId) window.location.href = `/clients?workflowRunId=${encodeURIComponent(item.workflowRunId)}`;
      else window.location.href = "/admin/dashboard/home#olivia-assistant";
      return;
    }

    setWorkItemBusy(item.id);
    try {
      if (item.kind === "client_candidate" && (action === "register" || action === "dismiss")) {
        const candidateResponse = await fetch(`/api/olivia/client-candidates/${encodeURIComponent(item.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: action }),
        });
        const candidateData = await candidateResponse.json();
        if (!candidateData.ok) throw new Error(candidateData.error || "신규 고객 제안 처리 실패");
        const resultMessage = candidateData.message || "신규 고객 제안을 처리했습니다.";
        appendAndSave({ role: "assistant", content: resultMessage, source: "web" });
        window.dispatchEvent(new CustomEvent("olivia-data-changed", { detail: { domain: "client", operation: action } }));
        return;
      }
      const recentWorkItems = compactWorkItemReferences(messages.flatMap((message) => message.workItems || []).slice(-12));
      const calendarTaskId = String(item.metadata?.calendarTaskId || (item.kind === "meeting" ? item.id : ""));
      const meetingTool = item.kind === "meeting" || item.kind === "memo" || (action === "link" && Boolean(calendarTaskId))
        ? action === "brief"
          ? { name: "prepare_meeting_brief", input: { calendarTaskId, workflowRunId: item.workflowRunId } }
          : action === "link"
            ? { name: "link_meeting_client", input: { calendarTaskId, workflowRunId: item.workflowRunId } }
            : action === "complete"
              ? { name: "complete_meeting", input: { calendarTaskId, workflowRunId: item.workflowRunId } }
              : action === "analyze"
                ? { name: "analyze_meeting_memo", input: { memoId: item.kind === "memo" ? item.id : undefined, calendarTaskId, workflowRunId: item.workflowRunId } }
                : action === "followups"
                  ? { name: "get_meeting_followups", input: { workflowRunId: item.workflowRunId } }
                  : null
        : null;
      const pendingTool = meetingTool
        ? { ...meetingTool, id: `meeting_item_${Date.now()}` }
        : action === "prepare"
        ? {
            name: "prepare_followup",
            input: { insightId: item.kind === "insight" ? item.id : undefined, workflowRunId: item.workflowRunId },
            id: `work_item_${Date.now()}`,
          }
        : {
            name: "manage_olivia_action",
            input: { itemId: item.id, itemKind: item.kind, operation: action, hours: action === "snooze" ? 24 : undefined },
            id: `work_item_${Date.now()}`,
          };
      const response = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingTool, recentWorkItems }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "업무 처리 실패");
      const result = data.toolResult;
      const resultMsg = result.message || "업무를 처리했습니다.";
      appendAndSave({
        role: "assistant",
        content: resultMsg,
        source: "web",
        toolResult: "done",
        workItems: result.workItems,
      });
    } catch (error) {
      const message = `⚠ 업무 처리 오류: ${error instanceof Error ? error.message : String(error)}`;
      appendAndSave({ role: "assistant", content: message, source: "web" });
    } finally {
      setWorkItemBusy(null);
    }
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
          {open ? "✕" : <Sparkles size={24} color="#fff" fill="#fff" strokeWidth={1} />}
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
          width: panelSize.width, height: panelSize.height,
          background: C.surface, borderRadius: 20,
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 60px rgba(21,88,85,.18), 0 4px 16px rgba(0,0,0,.08)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn .2s ease",
        }}>

          {/* 크기 조절 핸들 — 좌상단 모서리를 드래그해 패널 크기를 바꾼다 (패널이 우측 하단에 고정돼 있어 반대 방향으로 늘어남) */}
          {!isMobile && (
            <div
              onMouseDown={startResize}
              title="드래그해서 크기 조절"
              style={{
                position: "absolute", top: 0, left: 0, width: 22, height: 22,
                cursor: "nwse-resize", zIndex: 10,
              }}
            >
              <svg width="22" height="22" style={{ position: "absolute", top: 5, left: 5, opacity: 0.4 }}>
                <path d="M2 14 L14 2 M6 14 L14 6 M10 14 L14 10" stroke={C.muted} strokeWidth={1.5} strokeLinecap="round" fill="none" />
              </svg>
            </div>
          )}

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
              flexShrink: 0,
            }}><Sparkles size={18} color="#fff" fill="#fff" strokeWidth={1} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>올리비아</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>월간 포토클리닉 운영 비서</div>
            </div>
            {!isMobile && (
              <div role="group" aria-label="채팅창 크기" style={{
                display: "flex", gap: 3, padding: 3, borderRadius: 9,
                background: "rgba(255,255,255,.12)",
              }}>
                {(["small", "medium", "full"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPanelPreset(preset)}
                    aria-pressed={panelPreset === preset}
                    title={preset === "small" ? "작게" : preset === "medium" ? "중간" : "전체"}
                    style={{
                      width: 27, height: 24, border: 0, borderRadius: 6, cursor: "pointer",
                      background: panelPreset === preset ? "#fff" : "transparent",
                      color: panelPreset === preset ? C.teal : "rgba(255,255,255,.82)",
                      fontSize: preset === "small" ? 9 : preset === "medium" ? 11 : 13,
                      fontWeight: 900, lineHeight: 1,
                    }}
                  >
                    {preset === "small" ? "▣" : preset === "medium" ? "▤" : "□"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={clearChat}
              style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff",
                       padding: "4px 10px", borderRadius: 8, fontSize: 10, cursor: "pointer",
                       fontFamily: "inherit" }}>
              초기화
            </button>
          </div>

          {/* 메시지 목록 */}
          <div ref={messagesRef} style={{
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

                {msg.workItems?.length ? (
                  <div style={{ marginLeft: msg.role === "assistant" ? 28 : 0 }}>
                    {msg.workItems.map((item) => (
                      <OliviaChatWorkItemCard
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        busy={workItemBusy === item.id}
                        onAction={handleWorkItemAction}
                      />
                    ))}
                  </div>
                ) : null}

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
                        <div style={{ fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
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
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}><Sparkles size={13} color="#fff" fill="#fff" strokeWidth={1} /></div>
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
