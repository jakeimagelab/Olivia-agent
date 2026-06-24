import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  const { id } = await params;

  const [clientRes, runRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("workflow_runs")
      .select("*")
      .eq("client_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientRes.error || !clientRes.data)
    return NextResponse.json({ ok: false, error: "고객을 찾을 수 없습니다." }, { status: 404 });

  const { data: mailings } = await supabase
    .from("mailing_queue")
    .select("id, type, status, subject, to_email, created_at")
    .eq("hospital_name", clientRes.data.name)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    ok: true,
    client: clientRes.data,
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

  const allowed = [
    "name", "manager_name", "phone", "email", "department",
    "website_url", "instagram_url", "blog_url", "naver_place_url", "memo",
    "subscription_status", "workflow_status",
    "director_name", "main_treatments", "doctor_count", "special_notes",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

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
