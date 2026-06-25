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

  // 기본 컬럼 (항상 존재)
  const insertPayload: Record<string, unknown> = {
    name,
    manager_name: manager_name || null,
    phone: phone || null,
    email: email || null,
    website_url: website_url || null,
    instagram_url: instagram_url || null,
    blog_url: blog_url || null,
    naver_place_url: naver_place_url || null,
    memo: memo || null,
    subscription_status: subscription_status || "none",
  };

  // 확장 컬럼 — Supabase 스키마에 없으면 무시
  if (department    !== undefined) insertPayload.department     = department    || null;
  if (director_name !== undefined) insertPayload.director_name  = director_name  || null;
  if (main_treatments !== undefined) insertPayload.main_treatments = main_treatments || null;
  if (doctor_count  !== undefined) insertPayload.doctor_count   = doctor_count  ?? null;
  if (special_notes !== undefined) insertPayload.special_notes  = special_notes  || null;

  const { data: client, error } = await supabase
    .from("clients")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    // 스키마 캐시 오류 → name만으로 최소 재시도 (다른 컬럼들이 없을 수 있음)
    if (error.message.includes("schema cache") || error.message.includes("column")) {
      const minPayload: Record<string, unknown> = { name, subscription_status: subscription_status || "none" };
      // 있을 가능성 높은 컬럼들만 추가
      if (manager_name) minPayload.manager_name = manager_name;
      if (phone)        minPayload.phone         = phone;
      if (email)        minPayload.email         = email;
      if (memo)         minPayload.memo          = memo;
      const retry = await supabase.from("clients").insert(minPayload).select("id").single();
      if (retry.error) return NextResponse.json({ ok: false, error: `DB 컬럼 누락. Supabase SQL Editor에서 아래 실행 후 재시도:\nALTER TABLE clients ADD COLUMN IF NOT EXISTS department text DEFAULT '', ADD COLUMN IF NOT EXISTS director_name text DEFAULT '', ADD COLUMN IF NOT EXISTS main_treatments text DEFAULT '', ADD COLUMN IF NOT EXISTS doctor_count integer, ADD COLUMN IF NOT EXISTS special_notes text DEFAULT '', ADD COLUMN IF NOT EXISTS website_url text, ADD COLUMN IF NOT EXISTS instagram_url text, ADD COLUMN IF NOT EXISTS blog_url text, ADD COLUMN IF NOT EXISTS naver_place_url text;` }, { status: 500 });
      await supabase.from("workflow_runs").insert({ client_id: retry.data.id, client_name: name, current_step_key: "consult_meeting", status: "active", started_at: new Date().toISOString() });
      return NextResponse.json({ ok: true, id: retry.data.id, warning: "DB 컬럼 미완성 — 병원명만 저장됨. Supabase ALTER TABLE 실행 필요." });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
