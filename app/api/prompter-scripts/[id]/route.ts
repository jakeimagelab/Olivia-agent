import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope, assertProjectOwned } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("prompter_scripts").select("project_id").eq("id", id).maybeSingle();
  if (!existing?.project_id || !(await assertProjectOwned(db, existing.project_id, scope))) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  const { error } = await db.from("prompter_scripts").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
