import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToChecklistItem, rowToFile, rowToTask } from "@/lib/work-journal/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "work-journal-files";

type Params = { params: Promise<{ id: string }> };

const FIELD_MAP: Record<string, string> = {
  dueDate: "due_date",
  dueTime: "due_time",
  title: "title",
  assigneeName: "assignee_name",
  status: "status",
  priority: "priority",
  memo: "memo",
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: task, error } = await db.from("work_journal_tasks").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!task) return NextResponse.json({ ok: false, error: "업무를 찾을 수 없습니다." }, { status: 404 });

  const [{ data: checklist }, { data: files }] = await Promise.all([
    db.from("work_journal_checklist_items").select("*").eq("task_id", id).order("sort_order", { ascending: true }),
    db.from("work_journal_files").select("*").eq("task_id", id).order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({
    ok: true,
    task: {
      ...rowToTask(task),
      checklist: (checklist ?? []).map(rowToChecklistItem),
      files: (files ?? []).map(rowToFile),
    },
  });
}

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
  const { data, error } = await db.from("work_journal_tasks").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "업무를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, task: rowToTask(data) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  // 첨부파일은 DB 삭제(cascade)만으로는 스토리지 객체가 안 지워지므로 먼저 직접 정리한다.
  const { data: files } = await db.from("work_journal_files").select("storage_path").eq("task_id", id);
  if (files?.length) {
    await db.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
  }

  const { error } = await db.from("work_journal_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
