import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// calendar_tasks에는 고객 FK가 없어(레거시 스키마), 제목/메모에 병원명이 포함된 일정을
// 텍스트 매칭으로 모아 보여준다 — 이 고객과 "느슨하게" 연결된 일정 목록.
export async function GET(req: NextRequest) {
  const hospitalName = req.nextUrl.searchParams.get("hospitalName");
  if (!hospitalName) return NextResponse.json({ ok: false, error: "hospitalName이 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("calendar_tasks")
    .select("id, date, title, memo, category, time, end_time, location, completed")
    .or(`title.ilike.%${hospitalName}%,memo.ilike.%${hospitalName}%`)
    .order("date", { ascending: false })
    .order("time", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tasks: data ?? [] });
}
