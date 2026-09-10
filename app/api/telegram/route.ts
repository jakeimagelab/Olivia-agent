import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeQuoteTool } from "@/lib/olivia/v2/toolExecutors/quote";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { HermesChatResult, HermesToolCallRecord } from "@/lib/hermes/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;

const TOOL_LABELS: Record<string, string> = {
  create_quote:       "견적서 생성",
  create_contract:    "계약서 생성",
  send_file_transfer: "파일 전송",
  create_conti:       "콘티 생성",
  open_page:          "페이지 이동",
  calendar_add:       "일정 추가",
  calendar_add_bulk:  "일정 일괄 추가",
  calendar_list:      "할일 목록 조회",
  calendar_complete:  "완료 처리",
  calendar_delete:    "삭제",
  calendar_update:    "일정 수정",
  send_workflow_mail:    "워크플로우 메일 발송",
  get_workflow_status:   "워크플로우 현황 조회",
  advance_workflow_step: "워크플로우 단계 이동",
  list_mailing_queue:    "메일 대기 목록 조회",
  send_mailing:          "메일 발송",
  get_gallery:           "갤러리 조회",
  create_gallery:        "갤러리 등록",
};

// Hermes MCP tool 이름은 client.ts에서 "mcp_olivia_<tool>" 규칙으로 통일해 기록한다
// (lib/hermes/client.ts의 QUOTE_MCP_TOOLS 참고) — Telegram에서도 같은 규칙으로 찾는다.
const QUOTE_MUTATION_TOOLS = new Set([
  "mcp_olivia_create_quote",
  "mcp_olivia_add_quote_item",
  "mcp_olivia_update_quote_item",
  "mcp_olivia_remove_quote_item",
  "mcp_olivia_apply_quote_discount",
]);

function quoteContext(quoteId?: string): OliviaContextSnapshot {
  return { activeWorkspace: "quote", activeResourceId: quoteId, recentActions: [], revision: 0 };
}

async function tgRequest(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 대화 히스토리 저장 (chat_id 포함)
async function saveChat(chatId: string, role: "user" | "assistant", content: string) {
  try {
    const db = getSupabaseAdmin();
    await db.from("olivia_chat_messages").insert({
      role, content, source: "telegram", chat_id: chatId,
    });
  } catch {}
}

// 최근 대화 히스토리 조회 (최대 10개)
// 올리비아는 맥/노트북 웹 채팅과 텔레그램에서 하나의 연속된 대화로 동작해야 하므로,
// 텔레그램 채널로만 필터링하지 않고 채널 상관없이(source 무관) 가장 최근 대화를 가져온다.
async function getHistory(): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("olivia_chat_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!data || data.length === 0) return [];
    return (data as { role: "user" | "assistant"; content: string }[]).reverse();
  } catch {
    return [];
  }
}

async function getFilePath(fileId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  ).then(r => r.json());
  if (!res.ok) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${res.result.file_path}`;
}

async function transcribeVoice(buffer: ArrayBuffer): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "[음성 메시지 수신됨 — OPENAI_API_KEY를 설정해주세요]";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/ogg" }), "voice.ogg");
  form.append("model", "whisper-1");
  form.append("language", "ko");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  }).then(r => r.json());

  return res.text || "[음성 인식 실패]";
}

function getBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}

// create_quote/update 계열 tool이 성공하면 미리보기 이미지를 렌더해서 사진+승인버튼으로 보낸다.
// 렌더가 실패해도(Playwright 콜드스타트 등) 텍스트 응답 자체는 이미 있으니 조용히 텍스트로만 보낸다.
async function sendQuotePreview(base: string, chatId: number, quoteId: string, caption: string) {
  try {
    const renderRes = await fetch(`${base}/api/quotes/${quoteId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
      body: JSON.stringify({ format: "png" }),
    });
    const renderData = await renderRes.json();
    if (!renderData.ok || !renderData.url) return false;
    await tgRequest("sendPhoto", {
      chat_id: chatId,
      photo: renderData.url,
      caption: caption.slice(0, 1024),
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ 승인", callback_data: `quote_publish:${quoteId}` },
          { text: "✏️ 수정 요청", callback_data: `quote_edit:${quoteId}` },
        ]],
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Hermes가 실패했을 때(맥스튜디오 꺼짐 등) 예전엔 구형 Anthropic 엔진(/api/olivia)으로
// 대체했는데, 그 엔진은 별도로 관리되는 구형 경로라 Anthropic 크레딧이 끊기면 텔레그램 전체가
// 죽는 사례가 있었다(2026-09-10). 이제 웹챗이 이미 쓰고 있는 v2 엔진(OpenAI, 이미지가 없는
// 텍스트 메시지에만 해당 — 이미지 첨부는 여전히 runLegacyTelegramChat/Anthropic Vision을 쓴다)
// 으로 대체한다. v2는 SSE 스트림이라 여기서 텍스트만 모아 하나의 최종 문자열로 만든다.
async function runV2TelegramChat(input: { base: string; userText: string }): Promise<string> {
  const res = await fetch(`${input.base}/api/olivia/v2/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({
      message: input.userText,
      pageContext: "텔레그램 모바일 앱에서 접속 중. 승인 없이 도구를 바로 실행. 결과만 간결하게. 마크다운 최소화.",
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Olivia 연결 실패");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";
  let streamError: string | undefined;

  const handleBlock = (block: string) => {
    const line = block.split("\n").find((l) => l.startsWith("data:"));
    if (!line) return;
    let payload: { type?: string; delta?: string; message?: string } | undefined;
    try { payload = JSON.parse(line.slice(5).trimStart()); } catch { return; }
    if (!payload) return;
    if (payload.type === "text_delta" && typeof payload.delta === "string") finalText += payload.delta;
    if (payload.type === "error") streamError = payload.message || "Olivia 응답 중 오류가 발생했어요.";
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      handleBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) handleBlock(buffer);

  if (streamError) throw new Error(streamError);
  return finalText.trim() || "처리됐어요!";
}

async function runLegacyTelegramChat(input: {
  base: string;
  userText: string;
  imageBase64?: string | null;
  imageMime?: string;
}) {
  const history = await getHistory();
  const messages = history.length > 0 && history[history.length - 1]?.role === "user" && history[history.length - 1]?.content === input.userText
    ? history
    : [...history, { role: "user" as const, content: input.userText }];
  const oliviaRes = await fetch(`${input.base}/api/olivia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({
      messages,
      ...(input.imageBase64 ? { imageBase64: input.imageBase64, imageMime: input.imageMime || "image/jpeg" } : {}),
      pageContext: "텔레그램 모바일 앱에서 접속 중. 승인 없이 도구를 바로 실행. 결과만 간결하게. 마크다운 최소화.",
    }),
  });
  const data = await oliviaRes.json();
  if (!oliviaRes.ok || !data.ok) throw new Error(data.error || "클라우드 Olivia 연결 실패");
  if (data.type !== "tool_request") return data.text || "처리됐어요!";

  const prefix = data.text ? data.text + "\n\n" : "";
  const tools = Array.isArray(data.tools) && data.tools.length ? data.tools : [data.tool];
  const lines: string[] = [];
  for (const tool of tools) {
    const label = TOOL_LABELS[tool?.name] || tool?.name || "작업";
    try {
      const execRes = await fetch(`${input.base}/api/olivia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "", "x-base-url": input.base },
        body: JSON.stringify({ pendingTool: tool }),
      });
      const execData = await execRes.json();
      if (execData.ok && execData.toolResult) {
        const result = execData.toolResult;
        lines.push(result.action === "navigate"
          ? (result.message || "완료됐어요!") + `\n🔗 ${String(result.url || "").startsWith("http") ? result.url : input.base + result.url}`
          : (result.message || "완료됐어요!"));
      } else {
        lines.push(`⚠️ ${label} 실행 실패`);
      }
    } catch (error) {
      lines.push(`⚠️ ${label} 실행 중 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }
  return prefix + lines.join("\n\n");
}

async function sendTelegramText(chatId: number, reply: string) {
  for (let i = 0; i < reply.length; i += 4000) {
    await tgRequest("sendMessage", { chat_id: chatId, text: reply.slice(i, i + 4000) });
  }
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId: number = callbackQuery.message?.chat?.id;
  const userId = String(callbackQuery.from?.id || "");
  const data: string = callbackQuery.data || "";

  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "접근 권한이 없습니다." });
    return;
  }

  const [action, quoteId] = data.split(":");
  if (!quoteId) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    return;
  }

  if (action === "quote_publish") {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "처리 중…" });
    try {
      const result = await executeQuoteTool("publish_quote", {}, quoteContext(quoteId));
      const summary = typeof result.data?.summary === "string" ? result.data.summary : undefined;
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: result.success ? (summary || "견적서를 확정 공개했어요.") : `⚠️ ${result.error || "승인 처리에 실패했어요."}`,
      });
      await saveChat(String(chatId), "assistant", result.success ? (summary || "견적서를 확정 공개했어요.") : `⚠️ ${result.error}`);
    } catch (e: any) {
      await tgRequest("sendMessage", { chat_id: chatId, text: `⚠️ 승인 처리 중 오류: ${e.message}` });
    }
    return;
  }

  if (action === "quote_edit") {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    await tgRequest("sendMessage", { chat_id: chatId, text: "네, 어떻게 수정할까요? (예: \"수량 2명으로 늘려줘\", \"10만원 할인해줘\")" });
    return;
  }

  await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN 미설정" });

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId: number = message.chat.id;
  const chatIdStr = String(chatId);
  const userId = String(message.from?.id || "");

  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    await tgRequest("sendMessage", { chat_id: chatId, text: "접근 권한이 없습니다." });
    return NextResponse.json({ ok: true });
  }

  let userText = message.text || message.caption || "";
  let imageBase64: string | null = null;
  const imageMime = "image/jpeg";

  // 사진 처리
  if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    const url = await getFilePath(photo.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      imageBase64 = Buffer.from(buf).toString("base64");
      if (!userText) userText = "이 사진 분석해줘";
    }
  }

  // 음성 처리
  if (message.voice) {
    const url = await getFilePath(message.voice.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      userText = await transcribeVoice(buf);
    }
  }

  // 이미지 파일 처리
  if (message.document && message.document.mime_type?.startsWith("image/")) {
    const url = await getFilePath(message.document.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      imageBase64 = Buffer.from(buf).toString("base64");
      if (!userText) userText = "이 사진 분석해줘";
    }
  }

  if (!userText && !imageBase64) {
    await tgRequest("sendMessage", {
      chat_id: chatId,
      text: "텍스트, 사진, 또는 음성 메시지를 보내주세요 💬📷🎙️",
    });
    return NextResponse.json({ ok: true });
  }

  await tgRequest("sendChatAction", { chat_id: chatId, action: "typing" });

  // 현재 메시지 히스토리에 추가
  const userContent = userText || (imageBase64 ? "[📷 사진 전송됨]" : "");
  await saveChat(chatIdStr, "user", userContent);

  const base = getBaseUrl(req);

  // 사진이 첨부된 메시지는 Hermes가 아직 멀티모달을 지원하지 않아 기존 레거시 경로(Claude, 이미지
  // 분석 가능)로 그대로 처리한다 — 텍스트 전용 메시지만 Hermes로 보낸다(스펙: Quote E2E via Telegram).
  if (imageBase64) {
    try {
      const reply = await runLegacyTelegramChat({ base, userText, imageBase64, imageMime });
      await saveChat(chatIdStr, "assistant", reply);
      await sendTelegramText(chatId, reply);
    } catch (error) {
      await tgRequest("sendMessage", { chat_id: chatId, text: "⚠️ 연결 오류: " + (error instanceof Error ? error.message : "알 수 없는 오류") });
    }
    return NextResponse.json({ ok: true });
  }

  // 텍스트 메시지 — Hermes(Agent Engine)로 처리한다. conversationId를 chatId로 고정해서 Hermes
  // 자신의 세션 기억(X-Hermes-Session-Key)이 "방금 만든 견적"을 다음 턴에도 기억하게 한다 —
  // Olivia 쪽에 별도 "지금 편집 중인 견적" 상태를 새로 안 만든다.
  try {
    const hermesRes = await fetch(`${base}/api/hermes/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
      body: JSON.stringify({ message: userText, conversationId: chatIdStr }),
    });
    const result = await hermesRes.json() as HermesChatResult | { success: false; error: string; fallbackSafe?: boolean };

    if (!result.success) {
      if (result.fallbackSafe) throw new Error(result.error || "Hermes 연결 실패");
      const reply = "⚠️ 오류: " + (result.error || "알 수 없는 오류");
      await saveChat(chatIdStr, "assistant", reply);
      await sendTelegramText(chatId, reply);
      return NextResponse.json({ ok: true });
    }

    const reply = result.message || "처리됐어요!";
    await saveChat(chatIdStr, "assistant", reply);

    // 실제로 실행된 tool 중 견적 생성/수정이 성공한 게 있으면 미리보기 이미지+승인버튼을 보낸다.
    // result.message 텍스트만 보내는 대신, "실행됐다는 걸 실제로 확인한 뒤에만" 사진을 보낸다
    // (verification 없이는 완료로 취급하지 않는다는 이 코드베이스의 원칙).
    const toolCalls: HermesToolCallRecord[] = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    const quoteMutation = [...toolCalls].reverse().find((call) => QUOTE_MUTATION_TOOLS.has(call.name) && call.success);
    const quoteId = quoteMutation && typeof quoteMutation.data === "object" && quoteMutation.data
      ? (quoteMutation.data as Record<string, unknown>).quoteId as string | undefined
      : undefined;

    let sentPreview = false;
    if (quoteId) sentPreview = await sendQuotePreview(base, chatId, quoteId, reply);

    if (!sentPreview) await sendTelegramText(chatId, reply);
  } catch (hermesError) {
    console.warn("[telegram] Hermes unavailable; switching to cloud fallback", {
      error: hermesError instanceof Error ? hermesError.message : "unknown",
    });
    try {
      const reply = await runV2TelegramChat({ base, userText });
      await saveChat(chatIdStr, "assistant", reply);
      await sendTelegramText(chatId, reply);
    } catch (fallbackError) {
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Olivia 연결 오류: " + (fallbackError instanceof Error ? fallbackError.message : "알 수 없는 오류"),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
