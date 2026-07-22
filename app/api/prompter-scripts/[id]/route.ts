import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPrompterScope, assertProjectOwned } from "@/lib/prompter/scope";
import { decodeLegacySceneMetadata, encodeLegacySceneMetadata } from "@/lib/prompter/legacySceneMetadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = getPrompterScope(req);
  if (!scope.isAdmin && !scope.shareToken) {
    return NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.isShot !== "boolean") {
    return NextResponse.json({ ok: false, error: "isShot 값이 필요합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existing } = await db.from("prompter_scripts").select("project_id,speaker_map").eq("id", id).maybeSingle();
  if (!existing?.project_id || !(await assertProjectOwned(db, existing.project_id, scope))) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  let { data, error } = await db
    .from("prompter_scripts")
    .update({ is_shot: body.isShot, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,is_shot,updated_at")
    .single();
  if (error && /is_shot|column/i.test(error.message)) {
    const legacy = decodeLegacySceneMetadata(existing.speaker_map);
    ({ data, error } = await db
      .from("prompter_scripts")
      .update({
        speaker_map: encodeLegacySceneMetadata(legacy.speakerMap, body.isShot, legacy.gestureMap),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,updated_at")
      .single());
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, script: data });
}

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
