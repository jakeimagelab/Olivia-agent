import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  let query = db
    .from("prompter_projects")
    .select("id,name,created_at,updated_at,speakers")
    .order("updated_at", { ascending: false });
  query = scope.isAdmin ? query.is("share_token", null) : query.eq("share_token", scope.shareToken);
  const { data: projects, error } = await query;
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
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ ok: false, error: "프로젝트 이름을 입력해주세요." }, { status: 400 });

  const db = getSupabaseAdmin();

  if (body.id) {
    const { data: existing } = await db.from("prompter_projects").select("share_token").eq("id", body.id).maybeSingle();
    const owns = existing && (scope.isAdmin ? existing.share_token === null : existing.share_token === scope.shareToken);
    if (!owns) return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });

    const { data, error } = await db
      .from("prompter_projects")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, project: data });
  }

  // 공유 링크로 들어온 세션이 새 프로젝트를 만들면 share_token을 붙여, 실제 관리자
  // 데이터와는 완전히 분리된 자기만의 공간에서만 프롬프터를 쓸 수 있게 한다.
  const { data, error } = await db
    .from("prompter_projects")
    .insert({ name, share_token: scope.isAdmin ? null : scope.shareToken, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, project: data });
}
