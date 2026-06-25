import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);

  const [clientsRes, runsRes] = await Promise.all([
    query,
    supabase
      .from("workflow_runs")
      .select("client_id, current_step_key, status, started_at")
      .eq("status", "active"),
  ]);

  if (clientsRes.error)
    return NextResponse.json({ ok: false, error: clientsRes.error.message }, { status: 500 });

  const runMap = Object.fromEntries(
    (runsRes.data ?? []).map((r) => [r.client_id, r])
  );

  const clients = (clientsRes.data ?? []).map((c) => ({
    ...c,
    active_run: runMap[c.id] ?? null,
  }));

  return NextResponse.json({ ok: true, clients });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const {
    name, manager_name, phone, email, department,
    website_url, instagram_url, blog_url, naver_place_url, memo,
    subscription_status,
    director_name, main_treatments, doctor_count, special_notes,
  } = body;

  if (!name) return NextResponse.json({ ok: false, error: "병원명 필수" }, { status: 400 });

  // 보내려는 모든 필드
  const insertPayload: Record<string, unknown> = {
    name,
    manager_name:    manager_name    || null,
    phone:           phone           || null,
    email:           email           || null,
    website_url:     website_url     || null,
    instagram_url:   instagram_url   || null,
    blog_url:        blog_url        || null,
    naver_place_url: naver_place_url || null,
    memo:            memo            || null,
    subscription_status: subscription_status || "none",
    department:      department      || null,
    director_name:   director_name   || null,
    main_treatments: main_treatments || null,
    doctor_count:    doctor_count    ?? null,
    special_notes:   special_notes   || null,
  };

  // 없는 컬럼은 자동으로 제거하며 최대 15회 재시도
  let client: { id: string } | null = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    const { data, error } = await supabase
      .from("clients")
      .insert(insertPayload)
      .select("id")
      .single();

    if (!error) { client = data; break; }

    // 스키마에 없는 컬럼 → 해당 컬럼만 제거 후 재시도
    const missing = error.message.match(/Could not find the '(\w+)' column/)?.[1];
    if (missing && missing in insertPayload) {
      delete insertPayload[missing];
      continue;
    }

    // 그 외 진짜 오류
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ ok: false, error: "고객 등록에 실패했습니다." }, { status: 500 });
  }

  // 고객 등록 = 워크플로우 1단계 자동 시작
  await supabase.from("workflow_runs").insert({
    client_id: client.id,
    client_name: name,
    current_step_key: "consult_meeting",
    status: "active",
    started_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id: client.id });
}
