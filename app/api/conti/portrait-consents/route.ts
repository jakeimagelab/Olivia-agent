import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_DETAIL_FIELDS,
  DEFAULT_INTRO_TEXT,
  DEFAULT_USAGE_ITEMS,
  cleanText,
  isUuid,
  resolvePortraitConsentLinkUpdate,
  sanitizeFieldList,
} from "@/lib/portraitConsent";
import { validatePortraitConsentLink } from "@/lib/portraitConsentLinkServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "id, client_id, workflow_run_id, title, status, provider_name, signed_at, created_at, updated_at";

// GET — 콘티 페이지의 특정 고객/프로젝트에 연결된 초상권 동의서 목록.
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") || req.nextUrl.searchParams.get("client_id");
    const workflowRunId = req.nextUrl.searchParams.get("workflowRunId") || req.nextUrl.searchParams.get("workflow_run_id");
    if (clientId && !isUuid(clientId)) {
      return NextResponse.json({ ok: false, error: "고객 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (workflowRunId && !isUuid(workflowRunId)) {
      return NextResponse.json({ ok: false, error: "촬영 건 값이 올바르지 않습니다." }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    let query = db.from("portrait_consents").select(LIST_COLUMNS).order("created_at", { ascending: false });
    if (clientId && isUuid(clientId)) query = query.eq("client_id", clientId);
    if (workflowRunId && isUuid(workflowRunId)) query = query.eq("workflow_run_id", workflowRunId);
    if (!clientId && !workflowRunId) query = query.limit(50);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const clientIds = Array.from(new Set(rows.map((row) => row.client_id).filter((id): id is string => Boolean(id))));
    const workflowRunIds = Array.from(new Set(rows.map((row) => row.workflow_run_id).filter((id): id is string => Boolean(id))));
    const [clientsResult, workflowRunsResult] = await Promise.all([
      clientIds.length
        ? db.from("clients").select("id, hospital_name").in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      workflowRunIds.length
        ? db.from("workflow_runs").select("id, client_id, project_name, shoot_date").in("id", workflowRunIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientsResult.error) throw new Error(clientsResult.error.message);
    if (workflowRunsResult.error) throw new Error(workflowRunsResult.error.message);

    const clientNameById = new Map((clientsResult.data ?? []).map((client) => [client.id, client.hospital_name]));
    const workflowRunById = new Map((workflowRunsResult.data ?? []).map((run) => [run.id, run]));
    const consents = rows.map((row) => {
      const workflowRun = row.workflow_run_id ? workflowRunById.get(row.workflow_run_id) : null;
      return {
        ...row,
        client_name: row.client_id ? clientNameById.get(row.client_id) ?? null : null,
        workflow_run_name: workflowRun?.project_name || workflowRun?.shoot_date || null,
      };
    });

    return NextResponse.json({ ok: true, consents });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "목록 조회 실패" }, { status: 500 });
  }
}

// POST — 새 초상권 동의서 초안 생성. 제목/안내문/세부항목/활용목적은 모두 이후 수정 가능한 시작값.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const link = resolvePortraitConsentLinkUpdate(body);
    if (link.error) return NextResponse.json({ ok: false, error: link.error }, { status: 400 });

    const title = cleanText(body.title, 200) || "초상권 동의서";
    const introText = cleanText(body.introText, 2000) || DEFAULT_INTRO_TEXT;
    const detailFields = Array.isArray(body.detailFields) && body.detailFields.length
      ? sanitizeFieldList(body.detailFields)
      : DEFAULT_DETAIL_FIELDS;
    const usageItems = Array.isArray(body.usageItems) && body.usageItems.length
      ? sanitizeFieldList(body.usageItems)
      : DEFAULT_USAGE_ITEMS;

    const db = getSupabaseAdmin();
    const linkError = await validatePortraitConsentLink(db, link);
    if (linkError) return NextResponse.json({ ok: false, error: linkError }, { status: 400 });
    const { data, error } = await db
      .from("portrait_consents")
      .insert({
        client_id: link.clientId,
        workflow_run_id: link.workflowRunId,
        title,
        intro_text: introText,
        detail_fields: detailFields,
        usage_items: usageItems,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, consent: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "생성 실패" }, { status: 500 });
  }
}
