import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const projectId = req.nextUrl.searchParams.get("projectId");
  const db = getSupabaseAdmin();
  let query = db.from("prompter_scripts")
    .select("id,title,subject,content,client_id,project_id,editor_mode,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (clientId) query = query.eq("client_id", clientId);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, scripts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.content?.trim()) {
    return NextResponse.json({ ok: false, error: "대본 내용이 비어있습니다." }, { status: 400 });
  }
  if (!body.id && !body.projectId) {
    return NextResponse.json({ ok: false, error: "projectId 필수" }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const payload = {
    title: body.title?.trim() || "제목 없는 씬",
    subject: body.subject?.trim() ?? "",
    content: body.content,
    editor_mode: body.editorMode === "slides" ? "slides" : "text",
    client_id: body.clientId ?? null,
    ...(body.projectId ? { project_id: body.projectId } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = body.id
    ? await db.from("prompter_scripts").update(payload).eq("id", body.id).select().single()
    : await db.from("prompter_scripts").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 씬을 저장하면 그 프로젝트가 최근 목록 맨 위로 올라오게 부모 프로젝트의 updated_at도 갱신한다.
  if (data?.project_id) {
    await db.from("prompter_projects").update({ updated_at: new Date().toISOString() }).eq("id", data.project_id);
  }

  return NextResponse.json({ ok: true, script: data });
}
