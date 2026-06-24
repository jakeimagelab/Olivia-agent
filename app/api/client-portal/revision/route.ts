import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("client_revision_requests")
    .select("*")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ok: true, revisions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const { requestType, title, content, relatedFile, priority } = await req.json();
  if (!title || !content) return NextResponse.json({ ok: false, error: "제목과 내용을 입력해주세요." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("client_revision_requests")
    .insert({
      client_id: session.clientId,
      request_type: requestType ?? "general",
      title,
      content,
      related_file: relatedFile ?? "",
      priority: priority ?? "normal",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const taskPriority = priority === "urgent" ? "urgent" : priority === "high" ? "high" : "normal";

  await Promise.all([
    db.from("agent_tasks").insert({
      client_id: session.clientId,
      workflow_run_id: session.workflowRunId,
      task_type: "revision_review",
      title: `수정 요청 검토: ${title}`,
      description: content,
      input_data: { revisionId: data.id, requestType: requestType ?? "general", priority: priority ?? "normal" },
      priority: taskPriority,
      status: "pending",
    }),
    session.workflowRunId
      ? db
          .from("workflow_runs")
          .update({ current_step_key: "revision_manage", updated_at: new Date().toISOString() })
          .eq("id", session.workflowRunId)
      : Promise.resolve(),
    logPortalEvent({
      clientId: session.clientId,
      eventType: "revision_requested",
      targetType: "revision_request",
      targetId: data.id,
      memo: title,
      workflowRunId: session.workflowRunId,
    }),
  ]);

  return NextResponse.json({ ok: true, id: data.id });
}
