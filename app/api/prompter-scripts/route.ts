import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope, assertProjectOwned } from "@/lib/prompter/scope";
import { encodeLegacySceneMetadata, normalizeSceneMetadata } from "@/lib/prompter/legacySceneMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  const projectId = req.nextUrl.searchParams.get("projectId");

  // client_id 조회는 CRM(고객) 연동용 관리자 전용 경로 — 공유 세션에서는 막는다.
  if (clientId && !scope.isAdmin) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const db = getSupabaseAdmin();

  if (projectId) {
    if (!(await assertProjectOwned(db, projectId, scope))) {
      return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
    }
  } else if (!clientId && !scope.isAdmin) {
    // 공유 세션은 반드시 자기 프로젝트로 스코프해서 조회해야 한다 (전체 조회 금지).
    return NextResponse.json({ ok: false, error: "projectId 필수" }, { status: 400 });
  }

  const buildQuery = (includeProductionFields: boolean) => {
    let query = db
      .from("prompter_scripts")
      .select(`id,title,subject,content,client_id,project_id,editor_mode,speaker_map,sort_order,updated_at${includeProductionFields ? ",is_shot,gesture_map" : ""}`)
      .order("sort_order", { ascending: true })
      .limit(200);
    if (clientId) query = query.eq("client_id", clientId);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  };
  let { data, error } = await buildQuery(true);
  if (error && /is_shot|gesture_map|column/i.test(error.message)) {
    const legacyResult = await buildQuery(false);
    if (legacyResult.error) {
      return NextResponse.json({ ok: false, error: legacyResult.error.message }, { status: 500 });
    }
    const scripts = (legacyResult.data as unknown as Record<string, unknown>[] | null)?.map(normalizeSceneMetadata) ?? [];
    return NextResponse.json({ ok: true, scripts });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const scripts = (data as unknown as Record<string, unknown>[] | null)?.map(normalizeSceneMetadata) ?? [];
  return NextResponse.json({ ok: true, scripts });
}

export async function POST(req: NextRequest) {
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.content?.trim()) {
    return NextResponse.json({ ok: false, error: "대본 내용이 비어있습니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // 기존 씬 수정 — 소속 프로젝트를 소유한 세션만 허용.
  if (body.id) {
    const { data: existingScript } = await db.from("prompter_scripts").select("project_id").eq("id", body.id).maybeSingle();
    if (!existingScript?.project_id || !(await assertProjectOwned(db, existingScript.project_id, scope))) {
      return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
    }
    const payload = {
      title: body.title?.trim() || "제목 없는 씬",
      subject: body.subject?.trim() ?? "",
      content: body.content,
      editor_mode: body.editorMode === "slides" ? "slides" : "text",
      speaker_map: Array.isArray(body.speakerMap) ? body.speakerMap : [],
      is_shot: Boolean(body.isShot),
      gesture_map: Array.isArray(body.gestureMap) ? body.gestureMap.map((item: unknown) => String(item || "")) : [],
      updated_at: new Date().toISOString(),
    };
    let { data, error } = await db.from("prompter_scripts").update(payload).eq("id", body.id).select().single();
    if (error && /is_shot|gesture_map|column/i.test(error.message)) {
      const { is_shot: _isShot, gesture_map: _gestureMap, ...legacyPayload } = payload;
      legacyPayload.speaker_map = encodeLegacySceneMetadata(payload.speaker_map, payload.is_shot, payload.gesture_map);
      ({ data, error } = await db.from("prompter_scripts").update(legacyPayload).eq("id", body.id).select().single());
    }
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await db.from("prompter_projects").update({ updated_at: new Date().toISOString() }).eq("id", existingScript.project_id);
    return NextResponse.json({ ok: true, script: data });
  }

  // 새 씬 생성 — projectId 필수, 소유권 확인 후 그 프로젝트 맨 뒤 순서로 추가.
  if (!body.projectId) return NextResponse.json({ ok: false, error: "projectId 필수" }, { status: 400 });
  if (!(await assertProjectOwned(db, body.projectId, scope))) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  const { data: maxRow } = await db
    .from("prompter_scripts")
    .select("sort_order")
    .eq("project_id", body.projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = maxRow && maxRow.length ? (maxRow[0].sort_order ?? 0) + 1 : 0;

  const payload = {
    title: body.title?.trim() || "제목 없는 씬",
    subject: body.subject?.trim() ?? "",
    content: body.content,
    editor_mode: body.editorMode === "slides" ? "slides" : "text",
    speaker_map: Array.isArray(body.speakerMap) ? body.speakerMap : [],
    is_shot: Boolean(body.isShot),
    gesture_map: Array.isArray(body.gestureMap) ? body.gestureMap.map((item: unknown) => String(item || "")) : [],
    client_id: scope.isAdmin ? (body.clientId ?? null) : null,
    project_id: body.projectId,
    sort_order: nextOrder,
    updated_at: new Date().toISOString(),
  };
  let { data, error } = await db.from("prompter_scripts").insert(payload).select().single();
  if (error && /is_shot|gesture_map|column/i.test(error.message)) {
    const { is_shot: _isShot, gesture_map: _gestureMap, ...legacyPayload } = payload;
    legacyPayload.speaker_map = encodeLegacySceneMetadata(payload.speaker_map, payload.is_shot, payload.gesture_map);
    ({ data, error } = await db.from("prompter_scripts").insert(legacyPayload).select().single());
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 씬을 저장하면 그 프로젝트가 최근 목록 맨 위로 올라오게 부모 프로젝트의 updated_at도 갱신한다.
  await db.from("prompter_projects").update({ updated_at: new Date().toISOString() }).eq("id", body.projectId);

  return NextResponse.json({ ok: true, script: data });
}
