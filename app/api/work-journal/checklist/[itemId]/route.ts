import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToChecklistItem } from "@/lib/work-journal/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const body = await req.json().catch(() => null) as { label?: string; done?: boolean } | null;
  if (!body) return NextResponse.json({ ok: false, error: "요청 본문이 올바르지 않습니다." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string") patch.label = body.label.trim();
  if (typeof body.done === "boolean") patch.done = body.done;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "변경할 내용이 없습니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("work_journal_checklist_items").update(patch).eq("id", itemId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "세부 업무를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, item: rowToChecklistItem(data) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const db = getSupabaseAdmin();
  const { error } = await db.from("work_journal_checklist_items").delete().eq("id", itemId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
