import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RELATED_TABLE: Record<string, string> = {
  workflow_artifact: "workflow_artifacts",
  quote: "quotes",
  contract: "contracts",
  conti: "conti_saves",
  gallery: "photo_galleries",
};

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  if (!isPcrmUuid(clientId) || !isPcrmUuid(workflowRunId)) {
    return NextResponse.json({ ok: false, error: "고객과 프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("pcrm_publications")
    .select("*")
    .eq("client_id", clientId)
    .eq("workflow_run_id", workflowRunId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, publications: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const clientId = body?.clientId;
  const workflowRunId = body?.workflowRunId;
  const relatedType = String(body?.relatedType ?? "");
  const relatedId = String(body?.relatedId ?? "");
  const title = String(body?.title ?? "").trim();
  if (!isPcrmUuid(clientId) || !isPcrmUuid(workflowRunId) || !isPcrmUuid(relatedId)) {
    return NextResponse.json({ ok: false, error: "공개할 프로젝트 자료의 ID가 올바르지 않습니다." }, { status: 400 });
  }
  const table = RELATED_TABLE[relatedType];
  if (!table) return NextResponse.json({ ok: false, error: "지원하지 않는 자료 유형입니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: run } = await db.from("workflow_runs").select("id").eq("id", workflowRunId).eq("client_id", clientId).maybeSingle();
  if (!run) return NextResponse.json({ ok: false, error: "고객 프로젝트를 찾을 수 없습니다." }, { status: 404 });

  let sourceQuery = db.from(table).select("id,client_id,workflow_run_id").eq("id", relatedId).eq("client_id", clientId);
  sourceQuery = sourceQuery.eq("workflow_run_id", workflowRunId);
  const { data: source } = await sourceQuery.maybeSingle();
  if (!source) return NextResponse.json({ ok: false, error: "이 프로젝트에 연결된 자료가 아닙니다." }, { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await db.from("pcrm_publications").upsert({
    client_id: clientId,
    workflow_run_id: workflowRunId,
    related_type: relatedType,
    related_id: relatedId,
    title: title || "프로젝트 자료",
    description: String(body?.description ?? ""),
    version: 1,
    status: "published",
    published_at: now,
  }, { onConflict: "workflow_run_id,related_type,related_id,version" }).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await recordPcrmActivitySafely(db, {
    clientId,
    workflowRunId,
    actorType: "admin",
    actionType: "publication_published",
    title: `${title || "프로젝트 자료"} 고객 공개`,
    relatedType,
    relatedId,
  });
  return NextResponse.json({ ok: true, publication: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!isPcrmUuid(id)) return NextResponse.json({ ok: false, error: "공개 항목 ID가 올바르지 않습니다." }, { status: 400 });
  const action = String(body?.action ?? "");
  if (!["publish", "archive"].includes(action)) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 상태 변경입니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const patch = action === "publish"
    ? { status: "published", published_at: now, approved_at: null, revision_requested_at: null }
    : { status: "archived" };
  const { data, error } = await db.from("pcrm_publications").update(patch).eq("id", id).select().maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "공개 항목을 찾지 못했습니다." }, { status: 404 });
  await recordPcrmActivitySafely(db, {
    clientId: data.client_id,
    workflowRunId: data.workflow_run_id,
    actorType: "admin",
    actionType: action === "publish" ? "publication_published" : "publication_archived",
    title: `${data.title} ${action === "publish" ? "고객 공개" : "공개 취소"}`,
    relatedType: data.related_type,
    relatedId: data.related_id,
  });
  return NextResponse.json({ ok: true, publication: data });
}
