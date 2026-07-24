import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { hasPreparationValue } from "@/lib/pcrm/collaboration";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const { data, error } = await context.db.from("pcrm_preparation_items")
    .select("id,item_key,title,description,input_type,is_required,sort_order,value,status,submitted_at,confirmed_at")
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ items: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const values = Array.isArray(body?.values) ? body.values : [];
  if (values.length < 1 || values.length > 50) return pcrmError("저장할 준비 항목이 없습니다.");
  const ids = values.map((item: any) => item.id);
  if (ids.some((id: unknown) => !isPcrmUuid(id))) return pcrmError("준비 항목 ID가 올바르지 않습니다.");
  const { data: existing } = await context.db.from("pcrm_preparation_items")
    .select("id,status")
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId)
    .eq("is_active", true)
    .in("id", ids);
  if ((existing ?? []).length !== new Set(ids).size) return pcrmError("이 프로젝트의 준비 항목만 저장할 수 있습니다.", 403);
  if ((existing ?? []).some((item) => item.status === "confirmed")) {
    return pcrmError("담당자가 확인 완료한 항목은 수정할 수 없습니다.", 409);
  }
  const results = [];
  for (const item of values) {
    const value = item.value && typeof item.value === "object" ? item.value : { value: item.value ?? "" };
    if (JSON.stringify(value).length > 20_000) return pcrmError("항목별 입력 내용은 20,000자까지 저장할 수 있습니다.");
    const { data, error } = await context.db.from("pcrm_preparation_items")
      .update({ value, status: "draft", submitted_at: null, confirmed_at: null, confirmed_by: "" })
      .eq("id", item.id)
      .eq("client_id", context.session.clientId)
      .eq("workflow_run_id", context.session.workflowRunId)
      .select()
      .single();
    if (error) return pcrmError(error.message, 500);
    results.push(data);
  }
  return pcrmOk({ items: results });
}

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const { data: items, error: loadError } = await context.db.from("pcrm_preparation_items")
    .select("*")
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId)
    .eq("is_active", true);
  if (loadError) return pcrmError(loadError.message, 500);
  if (!(items ?? []).length) return pcrmError("관리자가 아직 촬영 준비 항목을 공개하지 않았습니다.", 409);
  const missing = (items ?? []).filter((item) => item.is_required && !hasPreparationValue(item.value));
  if (missing.length) return pcrmError(`필수 항목을 입력해 주세요: ${missing.map((item) => item.title).join(", ")}`);
  const now = new Date().toISOString();
  const { error } = await context.db.from("pcrm_preparation_items")
    .update({ status: "submitted", submitted_at: now })
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId)
    .eq("is_active", true)
    .in("status", ["pending", "draft", "revision_requested"]);
  if (error) return pcrmError(error.message, 500);
  await recordPcrmActivitySafely(context.db, {
    clientId: context.session.clientId,
    workflowRunId: context.session.workflowRunId,
    actorType: "client",
    actorName: context.session.clientName,
    actionType: "preparation_submitted",
    title: "촬영 준비 정보 제출",
    relatedType: "preparation",
  });
  return pcrmOk({ submittedAt: now });
}
