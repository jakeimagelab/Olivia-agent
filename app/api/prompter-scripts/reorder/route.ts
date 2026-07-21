import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope, assertProjectOwned } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 씬 목록 드래그 재정렬 — orderedIds 배열의 순서대로 sort_order를 0,1,2… 로 다시 매긴다.
export async function POST(req: NextRequest) {
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const projectId = body?.projectId as string | undefined;
  const orderedIds = body?.orderedIds as string[] | undefined;
  if (!projectId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ ok: false, error: "projectId, orderedIds 필수" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!(await assertProjectOwned(db, projectId, scope))) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  const { error } = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("prompter_scripts").update({ sort_order: index }).eq("id", id).eq("project_id", projectId)
    )
  ).then((results) => {
    const failed = results.find((r) => r.error);
    return { error: failed?.error ?? null };
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
