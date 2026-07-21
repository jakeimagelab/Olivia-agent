import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getSupabaseAdmin();
  const { data: projects, error } = await db
    .from("prompter_projects")
    .select("id,name,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const projectIds = (projects ?? []).map((p) => p.id);
  const sceneCounts: Record<string, number> = {};
  const lastActivity: Record<string, string> = {};
  if (projectIds.length) {
    const { data: scenes } = await db
      .from("prompter_scripts")
      .select("project_id,updated_at")
      .in("project_id", projectIds);
    for (const s of scenes ?? []) {
      if (!s.project_id) continue;
      sceneCounts[s.project_id] = (sceneCounts[s.project_id] ?? 0) + 1;
      if (!lastActivity[s.project_id] || s.updated_at > lastActivity[s.project_id]) {
        lastActivity[s.project_id] = s.updated_at;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    projects: (projects ?? []).map((p) => ({
      ...p,
      sceneCount: sceneCounts[p.id] ?? 0,
      lastActivity: lastActivity[p.id] ?? p.updated_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ ok: false, error: "프로젝트 이름을 입력해주세요." }, { status: 400 });

  const db = getSupabaseAdmin();
  const payload = { name, updated_at: new Date().toISOString() };
  const { data, error } = body.id
    ? await db.from("prompter_projects").update(payload).eq("id", body.id).select().single()
    : await db.from("prompter_projects").insert(payload).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, project: data });
}
