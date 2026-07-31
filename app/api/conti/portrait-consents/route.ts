import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_DETAIL_FIELDS,
  DEFAULT_INTRO_TEXT,
  DEFAULT_USAGE_ITEMS,
  cleanText,
  isUuid,
  sanitizeFieldList,
} from "@/lib/portraitConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "id, client_id, workflow_run_id, title, status, provider_name, signed_at, created_at, updated_at";

// GET — 콘티 페이지의 특정 고객/프로젝트에 연결된 초상권 동의서 목록.
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") || req.nextUrl.searchParams.get("client_id");
    const workflowRunId = req.nextUrl.searchParams.get("workflowRunId") || req.nextUrl.searchParams.get("workflow_run_id");

    const db = getSupabaseAdmin();
    let query = db.from("portrait_consents").select(LIST_COLUMNS).order("created_at", { ascending: false });
    if (clientId && isUuid(clientId)) query = query.eq("client_id", clientId);
    if (workflowRunId && isUuid(workflowRunId)) query = query.eq("workflow_run_id", workflowRunId);
    if (!clientId && !workflowRunId) query = query.limit(50);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, consents: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "목록 조회 실패" }, { status: 500 });
  }
}

// POST — 새 초상권 동의서 초안 생성. 제목/안내문/세부항목/활용목적은 모두 이후 수정 가능한 시작값.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = isUuid(body.clientId) ? body.clientId : null;
    const workflowRunId = isUuid(body.workflowRunId) ? body.workflowRunId : null;

    const title = cleanText(body.title, 200) || "초상권 동의서";
    const introText = cleanText(body.introText, 2000) || DEFAULT_INTRO_TEXT;
    const detailFields = Array.isArray(body.detailFields) && body.detailFields.length
      ? sanitizeFieldList(body.detailFields)
      : DEFAULT_DETAIL_FIELDS;
    const usageItems = Array.isArray(body.usageItems) && body.usageItems.length
      ? sanitizeFieldList(body.usageItems)
      : DEFAULT_USAGE_ITEMS;

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("portrait_consents")
      .insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        title,
        intro_text: introText,
        detail_fields: detailFields,
        usage_items: usageItems,
        status: "draft",
      })
      .select(LIST_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "생성 실패" }, { status: 500 });
  }
}
