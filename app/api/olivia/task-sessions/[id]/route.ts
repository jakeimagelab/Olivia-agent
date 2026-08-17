import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeTaskList, SESSION_TYPE_LABEL, type TaskSessionType } from "@/lib/olivia/taskSession/nextAction";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// components/olivia/OliviaTaskStrip.tsx 전용 — persistent chat 패널의 작은 "지금 하는 일"
// 한 줄을 채운다(60절 크기 제약: 이름/타입/진행률/다음 항목만).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: session, error } = await db
    .from("olivia_task_sessions")
    .select("id, project_id, session_type, status, client_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!session) return NextResponse.json({ ok: false, error: "Task Session을 찾을 수 없습니다." }, { status: 404 });

  const { data: client } = await db.from("clients").select("hospital_name").eq("id", session.client_id).maybeSingle();
  const sessionType = session.session_type as TaskSessionType;
  const { tasks } = session.project_id
    ? await computeTaskList(db, session.project_id, sessionType)
    : { tasks: [] };

  const done = tasks.filter((t) => t.status === "done").length;
  const remaining = tasks.filter((t) => t.status !== "done");

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      clientName: client?.hospital_name || "",
      typeLabel: SESSION_TYPE_LABEL[sessionType] || sessionType,
      total: tasks.length,
      done,
      nextTitle: remaining[0]?.title ?? null,
    },
  });
}
