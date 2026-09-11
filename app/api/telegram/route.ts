import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeQuoteTool } from "@/lib/olivia/v2/toolExecutors/quote";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { ensurePrimaryAssistantOwner, ensureTelegramOwnerConnection, isAuthorizedTelegramIdentity } from "@/lib/assistant/owners/service";
import {
  findAssistantMessageByExternalId,
  findAssistantMessageByTelegramOutboundId,
  getOrCreateAssistantConversation,
  listAssistantMessages,
  mergeAssistantMessageMetadata,
  saveAssistantMessage,
} from "@/lib/assistant/conversations/service";
import {
  claimTelegramWebhook,
  deliverTelegramAssistantMessage,
  finishTelegramWebhook,
  telegramAssistantExternalId,
  telegramInboundExternalId,
  uploadTelegramAttachment,
} from "@/lib/assistant/telegram/service";
import { sanitizeOliviaAttachments, type OliviaChatAttachment } from "@/lib/olivia/chatAttachments";
import { getTemporaryDocument, linkTemporaryDocumentsForHospital, updateTemporaryDocumentStatus } from "@/lib/olivia/documents/temporaryDocuments";
import { readPendingAction } from "@/lib/olivia/conversation/dialogueState";

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

function quoteContext(quoteId?: string): OliviaContextSnapshot {
  return { activeWorkspace: "quote", activeResourceId: quoteId, recentActions: [], revision: 0 };
}

async function tgRequest(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.description || `Telegram ${method} 요청 실패`);
  return data;
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
async function sendQuotePreview(base: string, chatId: number, quoteId: string, caption: string, pendingApproval?: TelegramPendingApproval): Promise<string | undefined> {
  try {
    const renderRes = await fetch(`${base}/api/quotes/${quoteId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
      body: JSON.stringify({ format: "png" }),
    });
    const renderData = await renderRes.json();
    if (!renderData.ok || !renderData.url) return undefined;
    const sent = await tgRequest("sendPhoto", {
      chat_id: chatId,
      photo: renderData.url,
      caption: caption.slice(0, 1024),
      reply_markup: {
        inline_keyboard: [pendingApproval ? [
          { text: `✅ ${pendingApproval.confirmLabel}`, callback_data: `olivia_approve:${pendingApproval.approvalId}` },
          { text: "⏳ 보류", callback_data: `olivia_defer:${pendingApproval.approvalId}` },
        ] : [
          { text: "✅ 승인", callback_data: `quote_publish:${quoteId}` },
          { text: "✏️ 수정 요청", callback_data: `quote_edit:${quoteId}` },
        ]],
      },
    });
    return sent?.result?.message_id == null ? undefined : String(sent.result.message_id);
  } catch {
    return undefined;
  }
}

type TelegramGeneratedDocument = { temporaryDocumentId: string; documentType: string; resourceId: string; status?: string };
type TelegramPendingApproval = { approvalId: string; summary: string; confirmLabel: string };

async function sendTemporaryDocumentPreview(base: string, chatId: number, document: TelegramGeneratedDocument, caption: string): Promise<string | undefined> {
  const renderRes = await fetch(`${base}/api/temporary-documents/${document.temporaryDocumentId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
  });
  const renderData = await renderRes.json().catch(() => null);
  if (!renderRes.ok || !renderData?.ok || !renderData.url) {
    throw new Error(renderData?.error || "문서 이미지 생성에 실패했습니다.");
  }
  const pending = document.status !== "linked";
  const sent = await tgRequest("sendPhoto", {
    chat_id: chatId,
    photo: renderData.url,
    caption: caption.slice(0, 1024),
    ...(pending ? { reply_markup: { inline_keyboard: [[
      { text: "✅ 내용 확인", callback_data: `temp_review:${document.temporaryDocumentId}` },
      { text: "✏️ 수정 요청", callback_data: `temp_edit:${document.temporaryDocumentId}` },
      { text: "⏳ 보류", callback_data: `temp_defer:${document.temporaryDocumentId}` },
    ]] } } : {}),
  });
  return sent?.result?.message_id == null ? undefined : String(sent.result.message_id);
}

// 텍스트 메시지는 웹챗과 같은 v2 엔진을 사용한다. v2는 SSE 스트림이므로 여기서 최종 텍스트와
// canonical message ID를 모은다. 이미지 첨부만 기존 Vision 경로를 유지한다.
type TelegramTurnResult = {
  text: string;
  persistedMessageId: string;
  quoteId?: string;
  generatedDocument?: TelegramGeneratedDocument;
  pendingApproval?: TelegramPendingApproval;
};

async function runV2TelegramChat(input: {
  base: string;
  userText: string;
  conversationId: string;
  persistedUserMessageId: string;
  clientRequestId: string;
  assistantExternalMessageId: string;
  attachments: OliviaChatAttachment[];
  replyContext?: Record<string, unknown>;
}): Promise<TelegramTurnResult> {
  const res = await fetch(`${input.base}/api/olivia/v2/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({
      message: input.userText,
      conversationId: input.conversationId,
      persistedUserMessageId: input.persistedUserMessageId,
      clientRequestId: input.clientRequestId,
      assistantExternalMessageId: input.assistantExternalMessageId,
      channel: "telegram",
      attachments: input.attachments,
      replyContext: input.replyContext,
      pageContext: "텔레그램 모바일 앱에서 접속 중. 공통 대화의 승인 상태를 그대로 사용. 결과만 간결하게. 마크다운 최소화.",
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
  let persistedMessageId = "";
  let quoteId: string | undefined;
  let generatedDocument: TelegramGeneratedDocument | undefined;
  let pendingApproval: TelegramPendingApproval | undefined;

  const handleBlock = (block: string) => {
    const line = block.split("\n").find((l) => l.startsWith("data:"));
    if (!line) return;
    let payload: { type?: string; delta?: string; message?: string; persistedMessageId?: string; result?: unknown; action?: unknown } | undefined;
    try { payload = JSON.parse(line.slice(5).trimStart()); } catch { return; }
    if (!payload) return;
    if (payload.type === "text_delta" && typeof payload.delta === "string") finalText += payload.delta;
    if (payload.type === "error") streamError = payload.message || "Olivia 응답 중 오류가 발생했어요.";
    if (payload.type === "message_complete" && typeof payload.persistedMessageId === "string") persistedMessageId = payload.persistedMessageId;
    if (payload.type === "ui_action" && payload.action && typeof payload.action === "object") {
      const action = payload.action as Record<string, unknown>;
      if (action.type === "REQUEST_APPROVAL" && typeof action.approvalId === "string" && typeof action.summary === "string") {
        pendingApproval = { approvalId: action.approvalId, summary: action.summary, confirmLabel: typeof action.confirmLabel === "string" ? action.confirmLabel : "진행" };
      }
    }
    if (payload.type === "tool_result" && payload.result && typeof payload.result === "object") {
      const result = payload.result as Record<string, unknown>;
      if (typeof result.quoteId === "string") quoteId = result.quoteId;
      if (typeof result.temporaryDocumentId === "string" && typeof result.resourceId === "string") {
        generatedDocument = {
          temporaryDocumentId: result.temporaryDocumentId,
          documentType: typeof result.documentType === "string" ? result.documentType : typeof result.quoteId === "string" ? "quote" : typeof result.contractId === "string" ? "contract" : "conti",
          resourceId: result.resourceId,
          status: typeof result.temporaryDocumentStatus === "string" ? result.temporaryDocumentStatus : undefined,
        };
      }
    }
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
  if (!persistedMessageId) throw new Error("Olivia 응답 저장 ID를 받지 못했어요.");
  return { text: finalText.trim() || "처리됐어요!", persistedMessageId, quoteId, generatedDocument, pendingApproval };
}

async function runLegacyTelegramChat(input: {
  base: string;
  userText: string;
  history: { role: "user" | "assistant"; content: string }[];
  imageBase64?: string | null;
  imageMime?: string;
}) {
  const messages = [...input.history, { role: "user" as const, content: input.userText }];
  const oliviaRes = await fetch(`${input.base}/api/olivia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({
      messages,
      ...(input.imageBase64 ? { imageBase64: input.imageBase64, imageMime: input.imageMime || "image/jpeg" } : {}),
      pageContext: "텔레그램 모바일 앱에서 접속 중. 공통 대화의 승인 상태를 그대로 사용. 결과만 간결하게. 마크다운 최소화.",
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

async function sendTelegramText(chatId: number, reply: string, replyMarkup?: object): Promise<string | undefined> {
  let outboundMessageId: string | undefined;
  for (let i = 0; i < reply.length; i += 4000) {
    const sent = await tgRequest("sendMessage", { chat_id: chatId, text: reply.slice(i, i + 4000), ...(i === 0 && replyMarkup ? { reply_markup: replyMarkup } : {}) });
    if (sent?.result?.message_id != null) outboundMessageId = String(sent.result.message_id);
  }
  return outboundMessageId;
}

async function deliverSavedReply(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  ownerId: string;
  conversationId: string;
  messageId: string;
  externalRequestId: string;
  chatId: number;
  base: string;
  reply: string;
  quoteId?: string;
  generatedDocument?: TelegramGeneratedDocument;
  pendingApproval?: TelegramPendingApproval;
}) {
  let outboundMessageId: string | undefined;
  await deliverTelegramAssistantMessage(input.db, {
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    externalRequestId: input.externalRequestId,
    send: async () => {
      try {
        const previewMessageId = input.generatedDocument
          ? await sendTemporaryDocumentPreview(input.base, input.chatId, input.generatedDocument, input.reply)
          : input.quoteId ? await sendQuotePreview(input.base, input.chatId, input.quoteId, input.reply, input.pendingApproval) : undefined;
        const approvalMarkup = input.pendingApproval ? { inline_keyboard: [[
          { text: `✅ ${input.pendingApproval.confirmLabel}`, callback_data: `olivia_approve:${input.pendingApproval.approvalId}` },
          { text: "⏳ 보류", callback_data: `olivia_defer:${input.pendingApproval.approvalId}` },
        ]] } : undefined;
        outboundMessageId = previewMessageId || await sendTelegramText(input.chatId, input.reply, approvalMarkup);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "이미지 생성 실패";
        outboundMessageId = await sendTelegramText(input.chatId, `${input.reply}\n\n⚠️ 문서는 임시문서함에 저장됐지만 이미지 미리보기를 만들지 못했어요: ${reason}`);
      }
    },
  });
  if (outboundMessageId) {
    await mergeAssistantMessageMetadata(input.db, {
      ownerId: input.ownerId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      metadata: {
        telegram: { outboundMessageId },
        ...(input.generatedDocument ? { temporaryDocumentId: input.generatedDocument.temporaryDocumentId, resourceType: input.generatedDocument.documentType, resourceId: input.generatedDocument.resourceId } : {}),
        ...(input.pendingApproval ? { pendingApproval: input.pendingApproval } : {}),
      },
    });
  }
}

async function handleCallbackQuery(callbackQuery: any, base: string) {
  const chatId: number = callbackQuery.message?.chat?.id;
  if (!chatId) return;
  const chatIdStr = String(chatId);
  const userId = String(callbackQuery.from?.id || "");
  const data: string = callbackQuery.data || "";

  const [action, resourceId] = data.split(":");
  if (!resourceId) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    return;
  }

  const db = getSupabaseAdmin();
  const owner = await ensurePrimaryAssistantOwner(db);
  const identity = {
    userId,
    chatId: chatIdStr,
    username: typeof callbackQuery.from?.username === "string" ? callbackQuery.from.username : undefined,
  };
  if (!await isAuthorizedTelegramIdentity(db, owner.id, identity, ALLOWED_USER_ID)) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "접근 권한이 없습니다." });
    return;
  }
  const connection = await ensureTelegramOwnerConnection(db, owner.id, {
    ...identity,
  });
  const conversation = await getOrCreateAssistantConversation(db, owner.id);
  const inboundExternalId = telegramInboundExternalId(chatIdStr, `callback:${callbackQuery.id}`);
  const assistantExternalId = telegramAssistantExternalId(chatIdStr, `callback:${callbackQuery.id}`);
  const claim = await claimTelegramWebhook(db, {
    eventKey: `callback:${callbackQuery.id}`,
    ownerId: owner.id,
    channelConnectionId: connection.id,
    sanitizedPayload: { callbackId: callbackQuery.id, chatId: chatIdStr, userId, action, resourceId },
  });
  if (!claim.claimed) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    return;
  }

  const isTemporaryAction = action.startsWith("temp_");
  const actionLabel = action === "quote_publish" ? "견적서 승인" : action === "quote_edit" ? "견적서 수정 요청" : action === "temp_review" ? "임시문서 내용 확인" : action === "temp_link" ? "고객등록 승인" : action === "temp_defer" ? "임시문서 보류" : action === "temp_edit" ? "임시문서 수정 요청" : action === "olivia_approve" ? "응, 진행해줘" : action === "olivia_defer" ? "일단 보류" : data;
  const userSaved = await saveAssistantMessage(db, {
    ownerId: owner.id,
    conversationId: conversation.id,
    role: "user",
    content: actionLabel,
    channel: "telegram",
    externalMessageId: inboundExternalId,
    deliveryStatus: "accepted",
    metadata: {
      ...(isTemporaryAction
        ? { resourceType: "temporary_document", resourceId }
        : action === "olivia_approve" || action === "olivia_defer"
          ? { approvalId: resourceId }
          : { resourceType: "quote", resourceId }),
      telegram: { callbackQueryId: callbackQuery.id },
    },
  });

  if (action === "olivia_approve" || action === "olivia_defer") {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "처리 중…" });
    const { data: conversationRow } = await db.from("assistant_conversations").select("metadata").eq("id", conversation.id).eq("owner_id", owner.id).maybeSingle();
    const pending = readPendingAction(conversationRow?.metadata);
    if (!pending || pending.id !== resourceId || pending.status !== "pending") {
      const reply = "이미 처리됐거나 더 이상 유효하지 않은 요청이에요.";
      const assistantSaved = await saveAssistantMessage(db, {
        ownerId: owner.id, conversationId: conversation.id, role: "assistant", content: reply, channel: "telegram",
        externalMessageId: assistantExternalId, parentMessageId: userSaved.message.id, deliveryStatus: "queued", metadata: { blocks: [{ type: "text", text: reply }] },
      });
      await deliverSavedReply({ db, ownerId: owner.id, conversationId: conversation.id, messageId: assistantSaved.message.id, externalRequestId: assistantExternalId, chatId, base, reply });
      await finishTelegramWebhook(db, claim.eventId, "processed");
      return;
    }
    try {
      const turn = await runV2TelegramChat({
        base,
        userText: actionLabel,
        conversationId: conversation.id,
        persistedUserMessageId: userSaved.message.id,
        clientRequestId: inboundExternalId,
        assistantExternalMessageId: assistantExternalId,
        attachments: [],
      });
      await deliverSavedReply({ db, ownerId: owner.id, conversationId: conversation.id, messageId: turn.persistedMessageId, externalRequestId: assistantExternalId, chatId, base, reply: turn.text, quoteId: turn.quoteId, generatedDocument: turn.generatedDocument, pendingApproval: turn.pendingApproval });
      await finishTelegramWebhook(db, claim.eventId, "processed");
    } catch {
      await finishTelegramWebhook(db, claim.eventId, "failed", "olivia_approval_failed").catch(() => undefined);
      await sendTelegramText(chatId, "지금은 처리하지 못했어요. 기존 내용은 그대로예요. 다시 해볼까요?").catch(() => undefined);
    }
    return;
  }

  if (isTemporaryAction) {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "처리 중…" });
    try {
      const document = await getTemporaryDocument(db, resourceId);
      let reply: string;
      let replyMarkup: object | undefined;
      if (action === "temp_review") {
        await updateTemporaryDocumentStatus(db, resourceId, "pending_client", { contentApprovedAt: new Date().toISOString() });
        reply = `${document.hospital_name}을 고객으로 등록할까요?`;
        replyMarkup = { inline_keyboard: [[
          { text: "✅ 고객등록", callback_data: `temp_link:${resourceId}` },
          { text: "⏳ 나중에", callback_data: `temp_defer:${resourceId}` },
        ]] };
      } else if (action === "temp_link") {
        const result = await linkTemporaryDocumentsForHospital(db, resourceId);
        reply = result.failed.length
          ? `${result.client.hospital_name} 고객을 등록하고 ${result.linked.length}개 문서를 연결했지만 ${result.failed.length}개는 임시문서함에 남았어요.`
          : `${result.client.hospital_name} 고객을 등록하고 관련 문서 ${result.linked.length}개를 모두 연결했어요.`;
      } else if (action === "temp_defer") {
        await updateTemporaryDocumentStatus(db, resourceId, "pending_review", { deferredAt: new Date().toISOString() });
        reply = "알겠어요. 문서는 임시문서함에 그대로 보관할게요.";
      } else {
        reply = "네, 수정할 내용을 메시지로 알려주세요.";
      }
      const assistantSaved = await saveAssistantMessage(db, {
        ownerId: owner.id, conversationId: conversation.id, role: "assistant", content: reply, channel: "telegram",
        externalMessageId: assistantExternalId, parentMessageId: userSaved.message.id, deliveryStatus: "queued",
        metadata: { blocks: [{ type: "text", text: reply }], resourceType: document.document_type, resourceId: document.source_id, temporaryDocumentId: resourceId },
      });
      await deliverTelegramAssistantMessage(db, {
        ownerId: owner.id, conversationId: conversation.id, messageId: assistantSaved.message.id, externalRequestId: assistantExternalId,
        send: async () => { await tgRequest("sendMessage", { chat_id: chatId, text: reply, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }); },
      });
      await finishTelegramWebhook(db, claim.eventId, "processed");
    } catch (error) {
      await finishTelegramWebhook(db, claim.eventId, "failed", "temporary_document_action_failed").catch(() => undefined);
      await tgRequest("sendMessage", { chat_id: chatId, text: `⚠️ 임시문서 처리 중 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}` }).catch(() => undefined);
    }
    return;
  }

  if (action === "quote_publish") {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "처리 중…" });
    try {
      const result = await executeQuoteTool("publish_quote", {}, quoteContext(resourceId));
      const summary = typeof result.data?.summary === "string" ? result.data.summary : undefined;
      const reply = result.success ? (summary || "견적서를 확정 공개했어요.") : `⚠️ ${result.error || "승인 처리에 실패했어요."}`;
      const assistantSaved = await saveAssistantMessage(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        channel: "telegram",
        externalMessageId: assistantExternalId,
        parentMessageId: userSaved.message.id,
        deliveryStatus: "queued",
        metadata: { blocks: [{ type: "text", text: reply }], resourceType: "quote", resourceId },
      });
      await deliverTelegramAssistantMessage(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        messageId: assistantSaved.message.id,
        externalRequestId: assistantExternalId,
        send: async () => { await sendTelegramText(chatId, reply); },
      });
      await finishTelegramWebhook(db, claim.eventId, "processed");
    } catch (e: any) {
      await finishTelegramWebhook(db, claim.eventId, "failed", "quote_publish_failed").catch(() => undefined);
      await tgRequest("sendMessage", { chat_id: chatId, text: `⚠️ 승인 처리 중 오류: ${e.message}` }).catch(() => undefined);
    }
    return;
  }

  if (action === "quote_edit") {
    await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    const reply = "네, 어떻게 수정할까요? (예: \"수량 2명으로 늘려줘\", \"10만원 할인해줘\")";
    const assistantSaved = await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "assistant",
      content: reply,
      channel: "telegram",
      externalMessageId: assistantExternalId,
      parentMessageId: userSaved.message.id,
      deliveryStatus: "queued",
      metadata: { blocks: [{ type: "text", text: reply }], resourceType: "quote", resourceId },
    });
    await deliverTelegramAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      messageId: assistantSaved.message.id,
      externalRequestId: assistantExternalId,
      send: async () => { await sendTelegramText(chatId, reply); },
    });
    await finishTelegramWebhook(db, claim.eventId, "processed");
    return;
  }

  await finishTelegramWebhook(db, claim.eventId, "ignored");
  await tgRequest("answerCallbackQuery", { callback_query_id: callbackQuery.id });
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN 미설정" });

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const message = update.message;
  if (!message) {
    if (update.callback_query) await handleCallbackQuery(update.callback_query, getBaseUrl(req));
    return NextResponse.json({ ok: true });
  }

  const chatId: number = message.chat.id;
  const chatIdStr = String(chatId);
  const userId = String(message.from?.id || "");

  const db = getSupabaseAdmin();
  const owner = await ensurePrimaryAssistantOwner(db);
  const identity = {
    userId,
    chatId: chatIdStr,
    username: typeof message.from?.username === "string" ? message.from.username : undefined,
  };
  if (!await isAuthorizedTelegramIdentity(db, owner.id, identity, ALLOWED_USER_ID)) {
    await tgRequest("sendMessage", { chat_id: chatId, text: "접근 권한이 없습니다." });
    return NextResponse.json({ ok: true });
  }
  const connection = await ensureTelegramOwnerConnection(db, owner.id, {
    ...identity,
  });
  const conversation = await getOrCreateAssistantConversation(db, owner.id);
  const telegramMessageId = String(message.message_id ?? update.update_id ?? "unknown");
  const inboundExternalId = telegramInboundExternalId(chatIdStr, telegramMessageId);
  const assistantExternalId = telegramAssistantExternalId(chatIdStr, telegramMessageId);
  const claim = await claimTelegramWebhook(db, {
    eventKey: String(update.update_id ?? inboundExternalId),
    ownerId: owner.id,
    channelConnectionId: connection.id,
    sanitizedPayload: {
      updateId: update.update_id ?? null,
      messageId: telegramMessageId,
      chatId: chatIdStr,
      userId,
      hasPhoto: Boolean(message.photo),
      hasVoice: Boolean(message.voice),
      hasDocument: Boolean(message.document),
    },
  });
  if (!claim.claimed) return NextResponse.json({ ok: true, duplicate: true });

  const base = getBaseUrl(req);
  const existingAssistant = await findAssistantMessageByExternalId(db, {
    ownerId: owner.id,
    conversationId: conversation.id,
    channel: "telegram",
    externalMessageId: assistantExternalId,
  });
  if (existingAssistant) {
    if (existingAssistant.delivery_status !== "delivered") {
      const metadata = existingAssistant.metadata && typeof existingAssistant.metadata === "object"
        ? existingAssistant.metadata as Record<string, unknown>
        : {};
      await deliverSavedReply({
        db,
        ownerId: owner.id,
        conversationId: conversation.id,
        messageId: existingAssistant.id,
        externalRequestId: assistantExternalId,
        chatId,
        base,
        reply: String(existingAssistant.content || "처리됐어요!"),
        quoteId: metadata.resourceType === "quote" && typeof metadata.resourceId === "string" ? metadata.resourceId : undefined,
        generatedDocument: typeof metadata.temporaryDocumentId === "string" && typeof metadata.resourceId === "string"
          ? { temporaryDocumentId: metadata.temporaryDocumentId, documentType: typeof metadata.resourceType === "string" ? metadata.resourceType : "document", resourceId: metadata.resourceId }
          : undefined,
        pendingApproval: metadata.pendingApproval && typeof metadata.pendingApproval === "object" ? metadata.pendingApproval as TelegramPendingApproval : undefined,
      });
    }
    await finishTelegramWebhook(db, claim.eventId, "processed");
    return NextResponse.json({ ok: true, resumed: true });
  }

  const existingInbound = await findAssistantMessageByExternalId(db, {
    ownerId: owner.id,
    conversationId: conversation.id,
    channel: "telegram",
    externalMessageId: inboundExternalId,
  });

  let userText = existingInbound?.content || message.text || message.caption || "";
  let imageBase64: string | null = null;
  let imageMime = "image/jpeg";
  const attachments: OliviaChatAttachment[] = sanitizeOliviaAttachments(existingInbound?.metadata?.attachments);
  const attachmentFailures: string[] = [];
  const repliedTelegramMessageId = message.reply_to_message?.message_id == null
    ? undefined
    : String(message.reply_to_message.message_id);
  const repliedMessage = repliedTelegramMessageId
    ? await findAssistantMessageByTelegramOutboundId(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        outboundMessageId: repliedTelegramMessageId,
      })
    : null;
  const repliedMetadata = repliedMessage?.metadata && typeof repliedMessage.metadata === "object" && !Array.isArray(repliedMessage.metadata)
    ? repliedMessage.metadata as Record<string, unknown>
    : undefined;
  const replyContext = repliedMetadata ? {
    resourceType: repliedMetadata.resourceType,
    resourceId: repliedMetadata.resourceId,
    resourceVersion: repliedMetadata.resourceVersion ?? repliedMetadata.version,
    workSessionId: repliedMetadata.workSessionId,
    clientId: repliedMetadata.clientId,
    projectId: repliedMetadata.projectId,
  } : undefined;

  try {
    if (message.photo) {
      const photo = message.photo[message.photo.length - 1];
      try {
        const url = await getFilePath(photo.file_id);
        if (!url) throw new Error("Telegram 사진 경로를 찾지 못했어요.");
        const downloaded = await fetch(url).then((response) => response.arrayBuffer());
        const bytes = new Uint8Array(downloaded as ArrayBuffer);
        imageBase64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
        if (!existingInbound) {
          attachments.push(await uploadTelegramAttachment(db, {
            fileName: `telegram-photo-${telegramMessageId}.jpg`,
            mimeType: imageMime,
            bytes,
          }));
        }
        if (!userText) userText = "이 사진 분석해줘";
      } catch (error) {
        attachmentFailures.push(error instanceof Error ? error.message : "Telegram 사진 저장 실패");
      }
    }

    if (message.voice) {
      const url = await getFilePath(message.voice.file_id);
      if (url) {
        try {
          userText = await transcribeVoice(await fetch(url).then((response) => response.arrayBuffer()));
        } catch (error) {
          attachmentFailures.push(error instanceof Error ? error.message : "음성 인식 실패");
        }
      }
    }

    if (message.document) {
      const mimeType = String(message.document.mime_type || "application/octet-stream");
      const fileName = String(message.document.file_name || `telegram-file-${telegramMessageId}`);
      try {
        const url = await getFilePath(message.document.file_id);
        if (!url) throw new Error("Telegram 파일 경로를 찾지 못했어요.");
        const downloaded = await fetch(url).then((response) => response.arrayBuffer());
        const bytes = new Uint8Array(downloaded as ArrayBuffer);
        if (!existingInbound) attachments.push(await uploadTelegramAttachment(db, { fileName, mimeType, bytes }));
        if (mimeType.startsWith("image/")) {
          imageMime = mimeType;
          imageBase64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
        }
        if (!userText) userText = mimeType.startsWith("image/") ? "이 사진 분석해줘" : `[첨부파일] ${fileName}`;
      } catch (error) {
        attachmentFailures.push(error instanceof Error ? error.message : `${fileName} 저장 실패`);
      }
    }

    if (!userText && !attachments.length) {
      await finishTelegramWebhook(db, claim.eventId, "failed", "attachment_unavailable");
      await tgRequest("sendMessage", { chat_id: chatId, text: attachmentFailures[0] || "텍스트, 사진, 파일 또는 음성 메시지를 보내주세요." });
      return NextResponse.json({ ok: true });
    }

    await tgRequest("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
    const userContent = userText || `[첨부파일 ${attachments.length}개]`;
    const userSaved = await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "user",
      content: userContent,
      channel: "telegram",
      externalMessageId: inboundExternalId,
      deliveryStatus: "accepted",
      metadata: {
        attachments,
        ...(attachmentFailures.length ? { attachmentFailures } : {}),
        ...(replyContext ? { replyContext } : {}),
        telegram: { chatId: chatIdStr, messageId: telegramMessageId, ...(repliedTelegramMessageId ? { repliedMessageId: repliedTelegramMessageId } : {}) },
      },
    });

    let turn: TelegramTurnResult;
    if (imageBase64) {
      const historyRows = await listAssistantMessages(db, owner.id, conversation.id, 30);
      const history = historyRows
        .filter((row) => row.id !== userSaved.message.id)
        .flatMap((row): { role: "user" | "assistant"; content: string }[] =>
          row.role === "user" || row.role === "assistant" ? [{ role: row.role, content: String(row.content || "") }] : []
        );
      const reply = await runLegacyTelegramChat({ base, userText: userContent, history, imageBase64, imageMime });
      const assistantSaved = await saveAssistantMessage(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        channel: "telegram",
        externalMessageId: assistantExternalId,
        parentMessageId: userSaved.message.id,
        deliveryStatus: "queued",
        metadata: { blocks: [{ type: "text", text: reply }], agentEngine: "legacy-vision" },
      });
      turn = { text: reply, persistedMessageId: assistantSaved.message.id };
    } else {
      turn = await runV2TelegramChat({
        base,
        userText: userContent,
        conversationId: conversation.id,
        persistedUserMessageId: userSaved.message.id,
        clientRequestId: inboundExternalId,
        assistantExternalMessageId: assistantExternalId,
        attachments,
        replyContext,
      });
    }

    await deliverSavedReply({
      db,
      ownerId: owner.id,
      conversationId: conversation.id,
      messageId: turn.persistedMessageId,
      externalRequestId: assistantExternalId,
      chatId,
      base,
      reply: turn.text,
      quoteId: turn.quoteId,
      generatedDocument: turn.generatedDocument,
      pendingApproval: turn.pendingApproval,
    });
    await finishTelegramWebhook(db, claim.eventId, "processed");
  } catch (error) {
    console.error("[telegram] canonical turn failed", error);
    await finishTelegramWebhook(db, claim.eventId, "failed", "telegram_turn_failed").catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
