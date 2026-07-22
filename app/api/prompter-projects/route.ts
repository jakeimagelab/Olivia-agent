import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope, assertProjectOwned } from "@/lib/prompter/scope";
import { registerClientCandidate } from "@/lib/olivia/clientCandidate";

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
    .select("id,name,created_at,updated_at,speakers,public_share_token")
    .order("updated_at", { ascending: false });
  // 공유 세션은 (1) 자기가 만든 프로젝트 또는 (2) 관리자가 통째로 공유해준 실제 프로젝트를 본다.
  query = scope.isAdmin
    ? query.is("share_token", null)
    : query.or(`share_token.eq.${scope.shareToken},public_share_token.eq.${scope.shareToken}`);
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
    if (!(await assertProjectOwned(db, body.id, scope))) {
      return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
    }

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
  if (scope.isAdmin) {
    after(() => registerClientCandidate(db, { hospitalName: name, sourceType: "prompter", sourceRecordId: data.id })
      .catch((candidateError) => console.error("[prompter] 신규 고객 감지 실패", candidateError)));
  }
  return NextResponse.json({ ok: true, project: data });
}
