import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isCalendarTodoTableMissing,
  LEGACY_CALENDAR_TODO_DATE,
  LEGACY_CALENDAR_TODO_MEMO,
  normalizeCalendarTodoTitle,
  rowToCalendarTodo,
} from "@/lib/calendarTodos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const legacyTodoRow = (row: Record<string, unknown>) => rowToCalendarTodo({ ...row, sort_order: 0 });

async function readLegacyTodos() {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_tasks")
    .select("id,title,completed,created_at,updated_at")
    .eq("date", LEGACY_CALENDAR_TODO_DATE)
    .eq("memo", LEGACY_CALENDAR_TODO_MEMO)
    .order("completed", { ascending: true })
    .order("created_at", { ascending: true });
  return { data: (data ?? []).map(legacyTodoRow), error };
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_todos")
    .select("*")
    .order("completed", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (isCalendarTodoTableMissing(error)) {
    const fallback = await readLegacyTodos();
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, todos: fallback.data, storage: "calendar_tasks_compat" });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, todos: (data ?? []).map(rowToCalendarTodo) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const validated = normalizeCalendarTodoTitle(body?.title);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });

  const db = getSupabaseAdmin();
  const { count } = await db.from("calendar_todos").select("id", { count: "exact", head: true });
  const { data, error } = await db.from("calendar_todos")
    .insert({ title: validated.title, completed: false, sort_order: count ?? 0 })
    .select("*")
    .single();
  if (isCalendarTodoTableMissing(error)) {
    const fallback = await db.from("calendar_tasks")
      .insert({
        date: LEGACY_CALENDAR_TODO_DATE,
        title: validated.title,
        memo: LEGACY_CALENDAR_TODO_MEMO,
        category: "general",
        completed: false,
      })
      .select("id,title,completed,created_at,updated_at")
      .single();
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, todo: legacyTodoRow(fallback.data), storage: "calendar_tasks_compat" }, { status: 201 });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, todo: rowToCalendarTodo(data) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (typeof body?.completed === "boolean") fields.completed = body.completed;
  if (body?.title !== undefined) {
    const validated = normalizeCalendarTodoTitle(body.title);
    if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    fields.title = validated.title;
  }
  if (!Object.keys(fields).length) return NextResponse.json({ ok: false, error: "변경할 값이 없습니다." }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().from("calendar_todos")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (isCalendarTodoTableMissing(error)) {
    const fallback = await getSupabaseAdmin().from("calendar_tasks")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("date", LEGACY_CALENDAR_TODO_DATE)
      .eq("memo", LEGACY_CALENDAR_TODO_MEMO)
      .select("id,title,completed,created_at,updated_at")
      .maybeSingle();
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    if (!fallback.data) return NextResponse.json({ ok: false, error: "할 일을 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, todo: legacyTodoRow(fallback.data), storage: "calendar_tasks_compat" });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "할 일을 찾지 못했습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, todo: rowToCalendarTodo(data) });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });
  const db = getSupabaseAdmin();
  const { error } = await db.from("calendar_todos").delete().eq("id", id);
  if (isCalendarTodoTableMissing(error)) {
    const fallback = await db.from("calendar_tasks")
      .delete()
      .eq("id", id)
      .eq("date", LEGACY_CALENDAR_TODO_DATE)
      .eq("memo", LEGACY_CALENDAR_TODO_MEMO);
    if (fallback.error) return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, storage: "calendar_tasks_compat" });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
