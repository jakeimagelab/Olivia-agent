import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToScheduleTodo } from "@/lib/work-journal/scheduleSerialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  title: "title",
  completed: "completed",
  assignee: "assignee",
  memo: "memo",
  sortOrder: "sort_order",
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "요청 본문이 올바르지 않습니다." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [clientKey, column] of Object.entries(FIELD_MAP)) {
    if (Object.prototype.hasOwnProperty.call(body, clientKey)) patch[column] = body[clientKey];
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "변경할 내용이 없습니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("schedule_todos").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "To-do를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, todo: rowToScheduleTodo(data) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { error } = await db.from("schedule_todos").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
