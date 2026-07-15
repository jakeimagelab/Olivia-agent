import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET  /api/calendar?month=2026-06          → 해당 월 전체 태스크
// GET  /api/calendar?date=2026-06-17        → 특정 날짜 태스크
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "2026-06"
  const date  = searchParams.get("date");  // "2026-06-17"

  const year  = searchParams.get("year");  // "2026"

  let query = db.from("calendar_tasks").select("*").order("time", { ascending: true, nullsFirst: false });

  if (date)       query = query.eq("date", date);
  else if (month) query = query.like("date", `${month}%`);
  else if (year)  query = query.like("date", `${year}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tasks: data ?? [] });
}

// POST /api/calendar  { date, title, memo, category, time?, end_time?, location? }
export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const { date, title, memo, category, time, end_time, location } = body;
  if (!date || !title) return NextResponse.json({ ok: false, error: "date, title 필수" }, { status: 400 });

  const base = { date, title, memo: memo ?? "", category: category ?? "general", completed: false };

  let { data, error } = await db
    .from("calendar_tasks")
    .insert({ ...base, time: time ?? null, end_time: end_time ?? null, location: location ?? null })
    .select("id").single();

  // 컬럼 없을 때 fallback
  if (error && (error.message.includes("column") || error.code === "42703")) {
    ({ data, error } = await db.from("calendar_tasks")
      .insert({ ...base, time: time ?? null, location: location ?? null })
      .select("id").single());
  }

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data!.id });
}

// PATCH /api/calendar  { id, ...fields }
export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  const { error } = await db.from("calendar_tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/calendar?id=xxx
export async function DELETE(req: NextRequest) {
  const db = getSupabaseAdmin();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  try {
    const item = await moveRecordToTrash(db, "calendar_task", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "일정 삭제 실패" }, { status: 500 });
  }
}
