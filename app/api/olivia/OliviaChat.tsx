"use client";
import { useEffect, useRef, useState } from "react";

// ── 타입 ─────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  toolRequest?: { name: string; input: any; id: string; label: string };
  toolResult?: string;
  isApproved?: boolean;
  imagePreview?: string; // data URL (display only)
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
  calendar_add:       "캘린더 일정 추가",
  calendar_add_bulk:  "캘린더 일정 일괄 추가",
  calendar_list:      "캘린더 할일 조회",
  calendar_complete:  "할일 완료 처리",
  calendar_delete:    "할일 삭제",
};

const TOOL_ICONS: Record<string, string> = {
  create_quote:       "📋",
  create_contract:    "📝",
  send_file_transfer: "📨",
  create_conti:       "🎬",
  open_page:          "🔗",
  calendar_add:       "📅",
  calendar_add_bulk:  "📅",
  calendar_list:      "🗓️",
  calendar_complete:  "✅",
  calendar_delete:    "🗑️",
};

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
    case "calendar_add":
      return `${input.date} · ${input.title}${input.time ? " " + input.time : ""}${input.location ? " 📍" + input.location : ""}`;
    case "calendar_add_bulk":
      return `${(input.tasks || []).length}개 일정 (${(input.tasks || []).map((t: any) => t.title).slice(0, 2).join(", ")}${(input.tasks || []).length > 2 ? " 외" : ""})`;
    case "calendar_list":
      return `${input.date} 할일 목록 조회`;
    case "calendar_complete":
      return `ID: ${(input.id || "").slice(0, 8)}… → ${input.completed === false ? "미완료" : "완료"}`;
    case "calendar_delete":
      return `ID: ${(input.id || "").slice(0, 8)}… 삭제`;
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}

export default function OliviaChat() {
  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [imgBase64, setImgBase64] = useState<string | null>(null);
  const [imgPreview,setImgPreview]= useState<string | null>(null);
  const [imgMime,   setImgMime]   = useState("image/jpeg");
  const [listening, setListening] = useState(false);
  const [isMobile,  setIsMobile]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const GREETING: Message = {
    role: "assistant",
    content: "안녕하세요, 정연호 대표님! 올리비아예요 ✨\n무엇을 도와드릴까요?\n\n예시:\n• \"포토클리닉병원 프리미엄 견적서 만들어줘\"\n• \"내일 오후 2시 오블리브 촬영 캘린더에 추가해줘\"\n• \"오늘 할일 목록 보여줘\"\n• 사진을 첨부해서 \"이 사진 어때?\" 도 물어보세요 📷",
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
        // imagePreview는 저장하지 않음 (용량)
      }));
      localStorage.setItem("olivia_chat", JSON.stringify(toSave.slice(-50)));
    } catch (e) {}
  }, [messages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([GREETING]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // ── 이미지 파일 선택 ──────────────────────────────────────
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const [meta, data] = dataUrl.split(",");
      const mime = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
      setImgBase64(data);
      setImgMime(mime);
      setImgPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── 음성 입력 ─────────────────────────────────────────────
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("음성 인식은 Chrome 브라우저에서 지원돼요.");
      return;
    }
    const recog = new SR();
    recog.lang = "ko-KR";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    setListening(true);
    recog.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    recog.onerror = () => setListening(false);
    recog.onend   = () => setListening(false);
    recog.start();
  };

  // ── 메시지 전송 ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if ((!text && !imgBase64) || loading) return;

    const sendText    = text || "이 사진 분석해줘";
    const sendImg     = imgBase64;
    const sendMime    = imgMime;
    const sendPreview = imgPreview;

    setInput("");
    setImgBase64(null);
    setImgPreview(null);

    const newMsg: Message = { role: "user", content: sendText, imagePreview: sendPreview || undefined };
    const updated = [...messages, newMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const apiMessages = updated
        .filter(m => !m.toolRequest || m.isApproved !== undefined)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          imageBase64: sendImg,
          imageMime: sendMime,
        }),
      });
      const raw = await res.text();
      if (!raw || raw.trim() === "") throw new Error("서버 응답이 없습니다. 잠시 후 다시 시도해주세요.");
      let data: any;
      try { data = JSON.parse(raw); } catch(e) { throw new Error("응답 오류: " + raw.slice(0, 100)); }
      if (!data.ok) throw new Error(data.error || "알 수 없는 오류");

      if (data.type === "tool_request") {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.text || "",
          toolRequest: {
            name:  data.tool.name,
            input: data.tool.input,
            id:    data.tool.id,
            label: TOOL_LABELS[data.tool.name] || data.tool.name,
          },
        }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.text }]);
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

    setMessages(prev => prev.map((m, i) =>
      i === msgIdx ? { ...m, isApproved: true } : m
    ));

    try {
      const res = await fetch("/api/olivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingTool: msg.toolRequest }),
      });
      const raw2 = await res.text();
      if (!raw2 || raw2.trim() === "") throw new Error("서버 응답이 없습니다.");
      let data: any;
      try { data = JSON.parse(raw2); } catch(e) { throw new Error("응답 오류: " + raw2.slice(0, 100)); }
      if (!data.ok) throw new Error(data.error || "실행 오류");

      const result = data.toolResult;

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

  const canSend = (input.trim().length > 0 || imgBase64 !== null) && !loading;

  return (
    <>
      {/* 플로팅 버튼 — 모바일+열림 상태에서는 숨김 */}
      {(!open || !isMobile) && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 1000,
            width: 56, height: 56, borderRadius: "50%",
            background: open ? C.orange : C.teal,
            border: "none", cursor: "pointer",
            boxShadow: "0 4px 16px rgba(21,88,85,.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, lineHeight: 1, transition: "all .2s",
          }}
          title="올리비아 AI 비서"
        >
          <span style={{ display: "block", lineHeight: 1 }}>{open ? "✕" : "✨"}</span>
        </button>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div style={isMobile ? {
          // 모바일: 바텀시트 (아래서 올라옴) — dvh 우선, 폴백 vh
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
          height: "90dvh",
          maxHeight: "90vh",
          background: C.surface, borderRadius: "18px 18px 0 0",
          border: `1px solid ${C.border}`,
          boxShadow: "0 -4px 32px rgba(21,88,85,.18)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "slideUp .25s ease",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        } : {
          // 데스크탑: 우하단 플로팅 패널
          position: "fixed", bottom: 92, right: 24, zIndex: 999,
          width: 360, height: 540,
          background: C.surface, borderRadius: 18,
          border: `1px solid ${C.border}`,
          boxShadow: "0 8px 32px rgba(21,88,85,.18)",
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
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}>
              <span style={{ lineHeight: 1 }}>✨</span>
            </div>
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
            {isMobile && (
              <button onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff",
                         width: 28, height: 28, borderRadius: 8, fontSize: 14, cursor: "pointer",
                         display: "flex", alignItems: "center", justifyContent: "center",
                         fontFamily: "inherit", flexShrink: 0 }}>
                ✕
              </button>
            )}
          </div>

          {/* 메시지 목록 */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 14px 0",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i}>
                {/* 메시지 버블 */}
                {(msg.content || msg.imagePreview) && (
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
                      {msg.imagePreview && (
                        <img
                          src={msg.imagePreview}
                          alt="첨부 이미지"
                          style={{
                            maxWidth: "100%", borderRadius: 8,
                            marginBottom: msg.content ? 6 : 0,
                            display: "block",
                          }}
                        />
                      )}
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

                {/* 승인/거절 상태 */}
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

          {/* 이미지 미리보기 */}
          {imgPreview && (
            <div style={{
              padding: "8px 12px 0",
              borderTop: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <img src={imgPreview} alt="첨부"
                style={{ height: 52, width: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              <div style={{ fontSize: 11, color: C.muted, flex: 1 }}>사진 첨부됨</div>
              <button onClick={() => { setImgBase64(null); setImgPreview(null); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                         fontSize: 16, color: C.muted, padding: 4 }}>✕</button>
            </div>
          )}

          {/* 입력창 */}
          <div style={{
            padding: "10px 12px",
            borderTop: imgPreview ? "none" : `1px solid ${C.border}`,
            display: "flex", gap: 6, alignItems: "center",
          }}>
            {/* 사진 첨부 버튼 */}
            <input type="file" accept="image/*" ref={fileRef}
              onChange={handleImageFile} style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              title="사진 첨부"
              style={{
                width: 34, height: 34, background: imgPreview ? C.teal : C.bg,
                border: `1px solid ${C.border}`, borderRadius: 9,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, flexShrink: 0,
                color: imgPreview ? "#fff" : C.muted,
              }}>
              📷
            </button>

            {/* 음성 입력 버튼 */}
            <button
              onClick={startVoice}
              title={listening ? "음성 인식 중..." : "음성 입력"}
              style={{
                width: 34, height: 34,
                background: listening ? C.orange : C.bg,
                border: `1px solid ${listening ? C.orange : C.border}`,
                borderRadius: 9, cursor: "pointer",
                display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, flexShrink: 0,
                animation: listening ? "pulse 1.2s infinite" : "none",
              }}>
              🎙️
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={listening ? "음성 인식 중..." : "무엇이 필요하세요?"}
              disabled={loading}
              style={{
                flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "9px 13px", fontSize: 12, fontFamily: "inherit",
                background: C.bg, color: C.txt, outline: "none",
              }}
            />
            <button onClick={send} disabled={!canSend}
              style={{
                width: 38, height: 38, background: canSend ? C.orange : C.border,
                border: "none", borderRadius: 10, cursor: canSend ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, transition: "background .15s",
              }}>
              ➤
            </button>
          </div>

        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
      `}</style>
    </>
  );
}
