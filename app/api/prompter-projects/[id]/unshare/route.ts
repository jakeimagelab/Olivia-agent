import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope } from "@/lib/prompter/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = getPrompterScope(req);
  if (!scope.isAdmin) {
    return NextResponse.json({ ok: false, error: "관리자만 공유를 해제할 수 있습니다." }, { status: 403 });
  }

  const db = getSupabaseAdmin();
  const { data: project } = await db.from("prompter_projects").select("public_share_token").eq("id", id).maybeSingle();
  if (project?.public_share_token) {
    await db.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("token", project.public_share_token);
  }
  const { error } = await db.from("prompter_projects").update({ public_share_token: null }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
