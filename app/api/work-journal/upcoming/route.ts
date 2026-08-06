import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToTask } from "@/lib/work-journal/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 왼쪽 "다가오는 일정" 위젯 — 오늘 이후(오늘 포함) 완료되지 않은 업무를 날짜/시간 순으로 몇 개만 보여준다.
export async function GET(req: NextRequest) {
  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 5;
  const today = new Date().toISOString().slice(0, 10);

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("work_journal_tasks")
    .select("*")
    .gte("due_date", today)
    .neq("status", "done")
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tasks: (data ?? []).map(rowToTask) });
}
