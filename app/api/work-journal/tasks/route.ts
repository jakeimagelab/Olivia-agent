import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToTask } from "@/lib/work-journal/serialize";
import type { TaskListItem } from "@/lib/work-journal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// date=YYYY-MM-DD → 그 날의 전체 업무(체크리스트 진행률 포함, 가운데 컬럼용).
// month=YYYY-MM → 그 달에 업무가 있는 날짜만 가볍게 반환(왼쪽 미니 캘린더 점 표시용).
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const searchParams = new URL(req.url).searchParams;
  const date = searchParams.get("date");
  const month = searchParams.get("month");

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, error: "month 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const [year, monthNum] = month.split("-").map(Number);
    const nextMonth = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;
    const { data, error } = await db
      .from("work_journal_tasks")
      .select("due_date, status")
      .gte("due_date", `${month}-01`)
      .lt("due_date", nextMonth);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const byDate = new Map<string, { total: number; done: number }>();
    for (const row of data ?? []) {
      const entry = byDate.get(row.due_date) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (row.status === "done") entry.done += 1;
      byDate.set(row.due_date, entry);
    }
    return NextResponse.json({
      ok: true,
      days: Array.from(byDate.entries()).map(([dueDate, counts]) => ({ dueDate, ...counts })),
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { data, error } = await db
    .from("work_journal_tasks")
    .select("*, work_journal_checklist_items(id, done)")
    .eq("due_date", date)
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const tasks: TaskListItem[] = (data ?? []).map((row) => {
    const checklist = (row.work_journal_checklist_items ?? []) as { id: string; done: boolean }[];
    return {
      ...rowToTask(row),
      checklistTotal: checklist.length,
      checklistDone: checklist.filter((item) => item.done).length,
    };
  });
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    dueDate?: string; dueTime?: string | null; title?: string; assigneeName?: string | null; priority?: string;
  } | null;
  const dueDate = body?.dueDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ ok: false, error: "날짜를 선택해주세요." }, { status: 400 });
  }
  const title = body?.title?.trim() ?? "";
  if (!title) return NextResponse.json({ ok: false, error: "업무 제목을 입력해주세요." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("work_journal_tasks")
    .insert({
      due_date: dueDate,
      due_time: body?.dueTime || null,
      title,
      assignee_name: body?.assigneeName || null,
      priority: body?.priority === "low" || body?.priority === "high" ? body.priority : "normal",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "업무 생성 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, task: { ...rowToTask(data), checklistTotal: 0, checklistDone: 0 } }, { status: 201 });
}
