import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── 실제 DB 컬럼: hospital_name, contact_name, phone, email, specialty, memo ── */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;

  const [clientRes, runRes] = await Promise.all([
    supabase.from("clients")
      .select("id, hospital_name, contact_name, phone, email, specialty, memo, created_at")
      .eq("id", id).single(),
    supabase.from("workflow_runs")
      .select("*").eq("client_id", id).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (clientRes.error || !clientRes.data)
    return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });

  const c = clientRes.data;
  const hospitalName = (c.hospital_name ?? "") as string;

  const { data: mailings } = await supabase
    .from("mailing_queue")
    .select("id, type, status, subject, to_email, created_at")
    .eq("hospital_name", hospitalName)
    .order("created_at", { ascending: false })
    .limit(10);

  // 프론트가 기대하는 필드명으로 정규화
  const client = {
    ...c,
    name:         hospitalName,
    manager_name: c.contact_name ?? "",
    department:   c.specialty    ?? "",
  };

  return NextResponse.json({
    ok: true,
    client,
    workflowRun: runRes.data ?? null,
    mailingQueue: mailings ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const body = await req.json();

  // 프론트 필드 → 실제 DB 컬럼 매핑
  const patch: Record<string, unknown> = {};
  const hospitalName = body.name || body.hospital_name;
  if (hospitalName !== undefined)                       patch.hospital_name = hospitalName;
  if (body.contact_name  !== undefined)                 patch.contact_name  = body.contact_name  || null;
  if (body.manager_name  !== undefined)                 patch.contact_name  = body.manager_name  || null;
  if (body.director_name !== undefined)                 patch.contact_name  = body.director_name || null;
  if (body.phone         !== undefined)                 patch.phone         = body.phone         || null;
  if (body.email         !== undefined)                 patch.email         = body.email         || null;
  if (body.specialty     !== undefined)                 patch.specialty     = body.specialty     || null;
  if (body.department    !== undefined)                 patch.specialty     = body.department    || null;
  if (body.memo          !== undefined)                 patch.memo          = body.memo          || null;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ ok: true });

  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
