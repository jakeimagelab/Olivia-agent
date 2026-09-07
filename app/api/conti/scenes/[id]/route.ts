import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const EDITABLE_FIELDS = [
  "name", "space_text", "minutes", "keyword", "description",
  "people_text", "patient_role_text", "note",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

// 셀 편집(fields) → 해당 필드의 field_sources를 "user"로 갱신 (수정 즉시 학습 후보가 됨).
// 순서 변경(sort/group_id)만 보낼 때는 field_sources를 건드리지 않는다 — 위치 이동은 "고침"이 아니다.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const db = getSupabaseAdmin();

  const { data: existing, error: fetchError } = await db
    .from("conti_scenes")
    .select("field_sources")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "장면을 찾을 수 없습니다." }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (body.fields && typeof body.fields === "object") {
    const nextSources = { ...(existing.field_sources as Record<string, string>) };
    for (const [key, value] of Object.entries(body.fields as Record<string, unknown>)) {
      if (!EDITABLE_FIELDS.includes(key as EditableField)) continue;
      update[key] = value;
      nextSources[key] = "user";
    }
    update.field_sources = nextSources;
  }

  if (typeof body.sort === "number") update.sort = body.sort;
  if (body.group_id !== undefined) update.group_id = body.group_id;
  if (Array.isArray(body.procedures)) update.procedures = body.procedures;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await db
    .from("conti_scenes")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ ok: false, error: updateError?.message ?? "수정 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scene: updated });
}
