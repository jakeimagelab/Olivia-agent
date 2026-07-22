import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 프로젝트를 지우면 소속된 씬(대본)도 전부 함께 지워진다 (DB의 on delete cascade).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  // 전체 공유(public_share_token)로 들어온 세션은 씬 편집까지는 되지만, 프로젝트 자체 삭제처럼
  // 되돌릴 수 없는 조작은 의도적으로 허용하지 않는다 — 여기만 assertProjectOwned를 안 쓰는 이유.
  const { data: existing } = await db.from("prompter_projects").select("share_token").eq("id", id).maybeSingle();
  const owns = existing && (scope.isAdmin ? existing.share_token === null : existing.share_token === scope.shareToken);
  if (!owns) return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });

  const { error } = await db.from("prompter_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
