import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { PCRM_INQUIRY_CATEGORIES, validateShortText } from "@/lib/pcrm/collaboration";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const { data: inquiries, error } = await context.db.from("pcrm_inquiries")
    .select("*").eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId)
    .order("last_message_at", { ascending: false });
  if (error) return pcrmError(error.message, 500);
  const ids = (inquiries ?? []).map((item) => item.id);
  const { data: messages } = ids.length
    ? await context.db.from("pcrm_inquiry_messages").select("*").in("inquiry_id", ids).order("created_at")
    : { data: [] };
  const messageIds = (messages ?? []).map((item) => item.id);
  const { data: attachmentRows } = messageIds.length
    ? await context.db.from("pcrm_attachments").select("*")
        .eq("client_id", context.session.clientId).eq("workflow_run_id", context.session.workflowRunId)
        .eq("entity_type", "inquiry_message").in("entity_id", messageIds)
    : { data: [] };
  const signedAttachments = await Promise.all((attachmentRows ?? []).map(async (item) => {
    const { data: signed } = await context.db.storage.from(item.storage_bucket)
      .createSignedUrl(item.storage_path, 60 * 15, { download: item.file_name });
    return { ...item, downloadUrl: signed?.signedUrl ?? null };
  }));
  const attachmentsByMessage = new Map<string, any[]>();
  for (const item of signedAttachments) attachmentsByMessage.set(item.entity_id, [...(attachmentsByMessage.get(item.entity_id) ?? []), item]);
  const grouped = new Map<string, any[]>();
  for (const message of messages ?? []) {
    const enriched = { ...message, attachments: attachmentsByMessage.get(message.id) ?? [] };
    grouped.set(message.inquiry_id, [...(grouped.get(message.inquiry_id) ?? []), enriched]);
  }
  return pcrmOk({ inquiries: (inquiries ?? []).map((item) => ({ ...item, messages: grouped.get(item.id) ?? [] })) });
}

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const content = validateShortText(body?.content, "문의 내용", 5000);
  if (!content.ok) return pcrmError(content.error);
  const now = new Date().toISOString();
  let inquiryId = String(body?.inquiryId ?? "");
  let title = "";
  if (inquiryId) {
    if (!isPcrmUuid(inquiryId)) return pcrmError("문의 ID가 올바르지 않습니다.");
    const { data: inquiry } = await context.db.from("pcrm_inquiries").select("id,title,status")
      .eq("id", inquiryId).eq("client_id", context.session.clientId)
      .eq("workflow_run_id", context.session.workflowRunId).maybeSingle();
    if (!inquiry || inquiry.status === "closed") return pcrmError("답변할 수 없는 문의입니다.", 409);
    title = inquiry.title;
  } else {
    const titleResult = validateShortText(body?.title, "문의 제목", 200);
    const category = String(body?.category ?? "other");
    if (!titleResult.ok) return pcrmError(titleResult.error);
    if (!PCRM_INQUIRY_CATEGORIES.includes(category as any)) return pcrmError("문의 분류가 올바르지 않습니다.");
    const { data: inquiry, error } = await context.db.from("pcrm_inquiries").insert({
      client_id: context.session.clientId,
      workflow_run_id: context.session.workflowRunId,
      category,
      title: titleResult.value,
      status: "open",
      created_by: "client",
      last_message_at: now,
    }).select().single();
    if (error) return pcrmError(error.message, 500);
    inquiryId = inquiry.id;
    title = inquiry.title;
  }
  const { data: message, error } = await context.db.from("pcrm_inquiry_messages").insert({
    inquiry_id: inquiryId,
    author_type: "client",
    author_name: context.session.clientName,
    content: content.value,
  }).select().single();
  if (error) return pcrmError(error.message, 500);
  await context.db.from("pcrm_inquiries").update({ status: "open", last_message_at: now, closed_at: null }).eq("id", inquiryId);
  await recordPcrmActivitySafely(context.db, {
    clientId: context.session.clientId,
    workflowRunId: context.session.workflowRunId,
    actorType: "client",
    actorName: context.session.clientName,
    actionType: "inquiry_message_created",
    title: `${title} 문의`,
    description: content.value,
    relatedType: "inquiry",
    relatedId: inquiryId,
  });
  return pcrmOk({ inquiryId, message }, 201);
}
