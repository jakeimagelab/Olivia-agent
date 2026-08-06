import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 담당자 입력을 매번 새로 타이핑하지 않도록, 과거에 한 번이라도 쓰인 담당자 이름을 자동완성 후보로 준다.
export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("work_journal_tasks").select("assignee_name").not("assignee_name", "is", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const names = Array.from(new Set((data ?? []).map((row) => row.assignee_name as string).filter(Boolean))).sort();
  return NextResponse.json({ ok: true, assignees: names });
}
