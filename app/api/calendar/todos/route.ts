import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeCalendarTodoTitle, rowToCalendarTodo } from "@/lib/calendarTodos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("calendar_todos")
    .select("*")
    .order("completed", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
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
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "할 일을 찾지 못했습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, todo: rowToCalendarTodo(data) });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("calendar_todos").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
