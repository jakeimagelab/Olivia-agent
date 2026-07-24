import { NextRequest } from "next/server";
import { pcrmError, pcrmOk, validateAdminProject } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { validateShortText } from "@/lib/pcrm/collaboration";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  const context = await validateAdminProject(clientId, workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  const { data: inquiries, error } = await context.db.from("pcrm_inquiries").select("*")
    .eq("client_id", clientId).eq("workflow_run_id", workflowRunId)
    .order("last_message_at", { ascending: false });
  if (error) return pcrmError(error.message, 500);
  const ids = (inquiries ?? []).map((item) => item.id);
  const { data: messages } = ids.length
    ? await context.db.from("pcrm_inquiry_messages").select("*").in("inquiry_id", ids).order("created_at")
    : { data: [] };
  const messageIds = (messages ?? []).map((item) => item.id);
  const { data: attachmentRows } = messageIds.length
    ? await context.db.from("pcrm_attachments").select("*")
        .eq("client_id", clientId).eq("workflow_run_id", workflowRunId)
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
  const body = await req.json().catch(() => null);
  const context = await validateAdminProject(body?.clientId, body?.workflowRunId);
  if (!context || !isPcrmUuid(body?.inquiryId)) return pcrmError("문의를 찾을 수 없습니다.", 404);
  const content = validateShortText(body?.content, "답변", 5000);
  if (!content.ok) return pcrmError(content.error);
  const { data: inquiry } = await context.db.from("pcrm_inquiries").select("*")
    .eq("id", body.inquiryId).eq("client_id", body.clientId).eq("workflow_run_id", body.workflowRunId).maybeSingle();
  if (!inquiry || inquiry.status === "closed") return pcrmError("답변할 수 없는 문의입니다.", 409);
  const now = new Date().toISOString();
  const { data: message, error } = await context.db.from("pcrm_inquiry_messages").insert({
    inquiry_id: inquiry.id,
    author_type: "admin",
    author_name: String(body?.authorName ?? "담당 매니저").trim().slice(0, 100),
    content: content.value,
  }).select().single();
  if (error) return pcrmError(error.message, 500);
  await context.db.from("pcrm_inquiries").update({ status: "answered", last_message_at: now }).eq("id", inquiry.id);
  await recordPcrmActivitySafely(context.db, {
    clientId: body.clientId,
    workflowRunId: body.workflowRunId,
    actorType: "admin",
    actorName: String(body?.authorName ?? "담당 매니저"),
    actionType: "inquiry_answered",
    title: `${inquiry.title} 답변`,
    description: content.value,
    relatedType: "inquiry",
    relatedId: inquiry.id,
  });
  return pcrmOk({ message });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const context = await validateAdminProject(body?.clientId, body?.workflowRunId);
  if (!context || !isPcrmUuid(body?.inquiryId)) return pcrmError("문의를 찾을 수 없습니다.", 404);
  const status = String(body?.status ?? "");
  if (!["open", "answered", "closed"].includes(status)) return pcrmError("문의 상태가 올바르지 않습니다.");
  const { data, error } = await context.db.from("pcrm_inquiries")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", body.inquiryId).eq("client_id", body.clientId).eq("workflow_run_id", body.workflowRunId)
    .select().maybeSingle();
  if (error || !data) return pcrmError(error?.message || "문의를 찾을 수 없습니다.", 404);
  return pcrmOk({ inquiry: data });
}
