import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToChecklistItem } from "@/lib/work-journal/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { label?: string } | null;
  const label = body?.label?.trim() ?? "";
  if (!label) return NextResponse.json({ ok: false, error: "세부 업무 내용을 입력해주세요." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { count } = await db.from("work_journal_checklist_items").select("id", { count: "exact", head: true }).eq("task_id", id);
  const { data, error } = await db
    .from("work_journal_checklist_items")
    .insert({ task_id: id, label, sort_order: count ?? 0 })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "세부 업무 추가 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, item: rowToChecklistItem(data) }, { status: 201 });
}
