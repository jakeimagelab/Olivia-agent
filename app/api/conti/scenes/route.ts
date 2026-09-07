import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BLANK_FIELD_SOURCES = {
  name: "blank", space_text: "blank", minutes: "blank", keyword: "blank",
  description: "blank", people_text: "blank", patient_role_text: "blank", note: "blank",
};

// 결과 표의 "장면 추가" — 템플릿 없이 빈 장면 한 줄을 맨 끝에 추가한다. 전부 blank로 시작해서
// 사용자가 직접 채우면 해당 필드가 user로 바뀐다(수정 시 PATCH /api/conti/scenes/[id]가 처리).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { runId, groupId } = body ?? {};
  if (!runId) {
    return NextResponse.json({ ok: false, error: "runId가 필요합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: existing, error: countError } = await db
    .from("conti_scenes")
    .select("sort")
    .eq("run_id", runId)
    .order("sort", { ascending: false })
    .limit(1);
  if (countError) return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });

  const nextSort = (existing?.[0]?.sort ?? -1) + 1;

  const { data: scene, error: insertError } = await db
    .from("conti_scenes")
    .insert({
      run_id: runId,
      group_id: groupId ?? null,
      sort: nextSort,
      name: "",
      space_text: "",
      minutes: null,
      keyword: "",
      description: "",
      procedures: [],
      people_text: "",
      patient_role_text: "",
      note: "",
      template_id: null,
      field_sources: BLANK_FIELD_SOURCES,
    })
    .select("*")
    .single();
  if (insertError || !scene) {
    return NextResponse.json({ ok: false, error: insertError?.message ?? "장면 추가 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scene });
}
