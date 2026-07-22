import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { calendarReminderDueAt, isCalendarReminderMinutes } from "@/lib/calendarReminders";
import { registerCalendarAwareness } from "@/lib/olivia/calendarAwareness";

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
  const reminderEnabled = body.reminder_enabled === true;
  const reminderMinutes = isCalendarReminderMinutes(body.reminder_minutes_before) ? Number(body.reminder_minutes_before) : 30;
  if (reminderEnabled && !time) {
    return NextResponse.json({ ok: false, error: "알람을 사용하려면 시작 시간을 선택해주세요." }, { status: 400 });
  }
  const reminderDueAt = reminderEnabled ? calendarReminderDueAt(date, time, reminderMinutes) : null;
  if (reminderEnabled && !reminderDueAt) {
    return NextResponse.json({ ok: false, error: "일정 날짜 또는 시작 시간이 올바르지 않습니다." }, { status: 400 });
  }

  const base = {
    date, title, memo: memo ?? "", category: category ?? "general", completed: false,
    reminder_enabled: reminderEnabled,
    reminder_minutes_before: reminderMinutes,
    reminder_due_at: reminderDueAt,
    reminder_claimed_at: null,
    reminder_sent_at: null,
    reminder_attempts: 0,
    reminder_last_error: null,
  };

  let { data, error } = await db
    .from("calendar_tasks")
    .insert({ ...base, time: time ?? null, end_time: end_time ?? null, location: location ?? null })
    .select("id").single();

  // 컬럼 없을 때 fallback
  if (!reminderEnabled && error && (error.message.includes("column") || error.code === "42703")) {
    const legacyBase = { date, title, memo: memo ?? "", category: category ?? "general", completed: false };
    ({ data, error } = await db.from("calendar_tasks")
      .insert({ ...legacyBase, time: time ?? null, location: location ?? null })
      .select("id").single());
  }

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await registerCalendarAwareness(db, {
    id: data!.id,
    date,
    title,
    category: category ?? "general",
    time: time ?? null,
    location: location ?? null,
    memo: memo ?? "",
    reminderEnabled,
  }).catch((awarenessError) => {
    console.error("[calendar] 올리비아 일정 인지 실패:", awarenessError instanceof Error ? awarenessError.message : awarenessError);
  });
  return NextResponse.json({ ok: true, id: data!.id, reminder_enabled: reminderEnabled, reminder_minutes_before: reminderMinutes, reminder_due_at: base.reminder_due_at });
}

// PATCH /api/calendar  { id, ...fields }
export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id, ...requestedFields } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  const allowed = ["date", "title", "memo", "category", "completed", "time", "end_time", "location", "reminder_enabled", "reminder_minutes_before"] as const;
  const fields: Record<string, unknown> = {};
  for (const key of allowed) if (requestedFields[key] !== undefined) fields[key] = requestedFields[key];

  const reminderChanged = ["date", "time", "reminder_enabled", "reminder_minutes_before"].some((key) => requestedFields[key] !== undefined);
  if (reminderChanged) {
    const { data: current, error: currentError } = await db.from("calendar_tasks").select("date,time,reminder_enabled,reminder_minutes_before").eq("id", id).maybeSingle();
    if (currentError || !current) return NextResponse.json({ ok: false, error: currentError?.message || "일정을 찾지 못했습니다." }, { status: 404 });
    const nextDate = String(fields.date ?? current.date);
    const nextTime = (fields.time ?? current.time) as string | null;
    const nextEnabled = fields.reminder_enabled === undefined ? current.reminder_enabled === true : fields.reminder_enabled === true;
    const requestedMinutes = fields.reminder_minutes_before ?? current.reminder_minutes_before ?? 30;
    if (!isCalendarReminderMinutes(requestedMinutes)) {
      return NextResponse.json({ ok: false, error: "지원하지 않는 알람 시점입니다." }, { status: 400 });
    }
    if (nextEnabled && !nextTime) {
      return NextResponse.json({ ok: false, error: "알람을 사용하려면 시작 시간을 선택해주세요." }, { status: 400 });
    }
    fields.reminder_enabled = nextEnabled;
    fields.reminder_minutes_before = Number(requestedMinutes);
    const nextDueAt = nextEnabled ? calendarReminderDueAt(nextDate, nextTime, Number(requestedMinutes)) : null;
    if (nextEnabled && !nextDueAt) {
      return NextResponse.json({ ok: false, error: "일정 날짜 또는 시작 시간이 올바르지 않습니다." }, { status: 400 });
    }
    fields.reminder_due_at = nextDueAt;
    fields.reminder_claimed_at = null;
    fields.reminder_sent_at = null;
    fields.reminder_attempts = 0;
    fields.reminder_last_error = null;
  }

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
    console.error("[calendar] DELETE 실패:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "일정 삭제 실패" }, { status: 500 });
  }
}
