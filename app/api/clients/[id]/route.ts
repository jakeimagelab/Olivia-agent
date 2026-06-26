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

  const client = clientRes.data;
  // hospital_name/name 둘 다 대응
  const displayName = client.hospital_name ?? client.name ?? "";

  const { data: mailings } = await supabase
    .from("mailing_queue")
    .select("id, type, status, subject, to_email, created_at")
    .eq("hospital_name", displayName)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    ok: true,
    client: { ...client, name: displayName },
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

  // 보내려는 모든 필드 수집
  const allAllowed = [
    "hospital_name", "name",
    "manager_name", "phone", "email", "department",
    "website_url", "instagram_url", "blog_url", "naver_place_url", "memo",
    "subscription_status", "workflow_status",
    "director_name", "main_treatments", "doctor_count", "special_notes",
  ];

  const patch: Record<string, unknown> = {};
  for (const key of allAllowed) {
    if (key in body) patch[key] = body[key];
  }
  // 프론트가 name으로 보내면 hospital_name에도 적용
  if ("name" in body) {
    patch.hospital_name = body.name;
    patch.name = body.name;
  }

  // 없는 컬럼 자동 감지·제거 후 재시도 (최대 20회)
  for (let attempt = 0; attempt < 20; attempt++) {
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (!error) return NextResponse.json({ ok: true });

    const missing = error.message.match(/Could not find the '(\w+)' column/)?.[1];
    if (missing && missing in patch) {
      delete patch[missing];
      continue;
    }

    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: false, error: "저장에 실패했습니다." }, { status: 500 });
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
