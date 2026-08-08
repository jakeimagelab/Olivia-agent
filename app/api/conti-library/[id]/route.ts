import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToDocument, rowToScene } from "@/lib/conti-library/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "conti-case-library";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: doc, error } = await db.from("conti_case_documents").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!doc) return NextResponse.json({ ok: false, error: "사례를 찾을 수 없습니다." }, { status: 404 });

  const { data: scenes } = await db
    .from("conti_case_scenes")
    .select("*")
    .eq("case_document_id", id)
    .order("scene_order", { ascending: true });

  return NextResponse.json({ ok: true, document: rowToDocument(doc), scenes: (scenes ?? []).map(rowToScene) });
}

// 검수 단계(요청서 8장) — 진료과/병원명 정도만 가볍게 수정할 수 있게 한다. 장면 하나하나를
// 다 수정하게 만들지 않는다는 요청서 지시에 따라 여기선 문서 단위 필드만 허용한다.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    clinicName?: string; departments?: string[]; shootingType?: string; doctorCount?: number;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: "요청 본문이 올바르지 않습니다." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.clinicName !== undefined) patch.clinic_name = body.clinicName;
  if (body.departments !== undefined) patch.departments = body.departments;
  if (body.shootingType !== undefined) patch.shooting_type = body.shootingType;
  if (body.doctorCount !== undefined) patch.doctor_count = body.doctorCount;
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "변경할 내용이 없습니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("conti_case_documents").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "사례를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, document: rowToDocument(data) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: doc } = await db.from("conti_case_documents").select("storage_path").eq("id", id).maybeSingle();
  if (doc?.storage_path) await db.storage.from(BUCKET).remove([doc.storage_path]);

  const { error } = await db.from("conti_case_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
