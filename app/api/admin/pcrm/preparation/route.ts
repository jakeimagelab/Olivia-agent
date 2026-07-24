import { NextRequest } from "next/server";
import { DEFAULT_PREPARATION_ITEMS, PCRM_PREPARATION_INPUT_TYPES, validateShortText } from "@/lib/pcrm/collaboration";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { pcrmError, pcrmOk, validateAdminProject } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  const context = await validateAdminProject(clientId, workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  const { data, error } = await context.db.from("pcrm_preparation_items")
    .select("*")
    .eq("client_id", clientId)
    .eq("workflow_run_id", workflowRunId)
    .order("sort_order");
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const context = await validateAdminProject(body?.clientId, body?.workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  const custom = Array.isArray(body?.items) ? body.items : DEFAULT_PREPARATION_ITEMS;
  if (custom.length < 1 || custom.length > 50) return pcrmError("준비 항목은 1~50개까지 등록할 수 있습니다.");
  const rows = [];
  for (let index = 0; index < custom.length; index += 1) {
    const item = custom[index] as Record<string, unknown>;
    const title = validateShortText(item.title, "항목명", 200);
    const itemKey = String(item.item_key ?? item.itemKey ?? "").trim();
    const inputType = String(item.input_type ?? item.inputType ?? "text");
    if (!title.ok || !itemKey || itemKey.length > 100 || !PCRM_PREPARATION_INPUT_TYPES.includes(inputType as any)) {
      return pcrmError(title.ok ? "촬영 준비 항목 형식이 올바르지 않습니다." : title.error);
    }
    rows.push({
      client_id: body.clientId,
      workflow_run_id: body.workflowRunId,
      item_key: itemKey,
      title: title.value,
      description: String(item.description ?? "").trim().slice(0, 1000),
      input_type: inputType,
      is_required: Boolean(item.is_required ?? item.isRequired),
      is_active: item.is_active === undefined && item.isActive === undefined ? true : Boolean(item.is_active ?? item.isActive),
      sort_order: Number.isInteger(item.sort_order) ? item.sort_order : index,
    });
  }
  const { data, error } = await context.db.from("pcrm_preparation_items")
    .upsert(rows, { onConflict: "workflow_run_id,item_key" })
    .select();
  if (error) return pcrmError(error.message, 500);
  await recordPcrmActivitySafely(context.db, {
    clientId: body.clientId,
    workflowRunId: body.workflowRunId,
    actorType: "admin",
    actionType: "preparation_configured",
    title: "촬영 준비 항목 설정",
    description: `${rows.length}개 항목`,
    relatedType: "preparation",
  });
  return pcrmOk({ items: data ?? [] }, 201);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const context = await validateAdminProject(body?.clientId, body?.workflowRunId);
  if (!context || !isPcrmUuid(body?.id)) return pcrmError("촬영 준비 항목을 찾을 수 없습니다.", 404);
  const action = String(body?.action ?? "update");
  const allowed = ["update", "confirm", "request_revision"];
  if (!allowed.includes(action)) return pcrmError("지원하지 않는 작업입니다.");
  let patch: Record<string, unknown>;
  if (action === "confirm") {
    patch = { status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: String(body?.confirmedBy ?? "관리자") };
  } else if (action === "request_revision") {
    patch = { status: "revision_requested", confirmed_at: null, confirmed_by: "" };
  } else {
    const inputType = String(body?.inputType ?? body?.input_type ?? "text");
    if (!PCRM_PREPARATION_INPUT_TYPES.includes(inputType as any)) return pcrmError("입력 유형이 올바르지 않습니다.");
    patch = {
      title: String(body?.title ?? "").trim().slice(0, 200),
      description: String(body?.description ?? "").trim().slice(0, 1000),
      input_type: inputType,
      is_required: Boolean(body?.isRequired ?? body?.is_required),
      is_active: Boolean(body?.isActive ?? body?.is_active),
      sort_order: Number.isInteger(body?.sortOrder) ? body.sortOrder : 0,
    };
    if (!patch.title) return pcrmError("항목명을 입력해 주세요.");
  }
  const { data, error } = await context.db.from("pcrm_preparation_items")
    .update(patch)
    .eq("id", body.id)
    .eq("client_id", body.clientId)
    .eq("workflow_run_id", body.workflowRunId)
    .select()
    .maybeSingle();
  if (error || !data) return pcrmError(error?.message || "촬영 준비 항목을 찾을 수 없습니다.", 404);
  await recordPcrmActivitySafely(context.db, {
    clientId: body.clientId,
    workflowRunId: body.workflowRunId,
    actorType: "admin",
    actionType: `preparation_${action}`,
    title: action === "confirm" ? `${data.title} 확인 완료` : action === "request_revision" ? `${data.title} 보완 요청` : `${data.title} 설정 변경`,
    relatedType: "preparation",
    relatedId: data.id,
  });
  return pcrmOk({ item: data });
}
