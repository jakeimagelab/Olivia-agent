import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getKstDate } from "@/lib/olivia/briefings";
import { saveMeetingCommitments } from "@/lib/olivia/commitments";
import { createStepTasks } from "@/lib/workflowAutomation";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.memoId && !body.analysis) return NextResponse.json({ ok: false, error: "memoId 또는 analysis가 필요합니다." }, { status: 400 });
    const db = getSupabaseAdmin();
    let memo: any = null;
    if (body.memoId) {
      const { data, error } = await db.from("consultation_memos").select("*").eq("id", body.memoId).single();
      if (error) throw new Error(error.message);
      memo = data;
    }
    const analysis = body.analysis || memo?.extracted_data || {};
    const clientId = body.clientId || memo?.hospital_id || null;
    let run: any = null;
    if (body.workflowRunId) {
      const { data } = await db.from("workflow_runs").select("*").eq("id", body.workflowRunId).maybeSingle();
      run = data;
    } else if (clientId) {
      const { data } = await db.from("workflow_runs").select("*").eq("client_id", clientId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      run = data;
    }
    const commitments = await saveMeetingCommitments(db, analysis, { memoId: body.memoId || memo?.id, clientId, projectId: run?.project_id, workflowRunId: run?.id });
    const nextAction = String(analysis.nextAction || analysis.next_action || "").trim();
    if (run?.id && nextAction && (!String(run.next_action || "").trim() || run.next_action_source === "ai")) {
      await db.from("workflow_runs").update({ next_action: nextAction, next_action_source: "ai", next_action_updated_at: new Date().toISOString() }).eq("id", run.id);
    }
    let createdTasks: any[] = [];
    if (run?.id && run.current_step_key === "quote") {
      const taskResult = await createStepTasks(db, run.id, "quote");
      createdTasks = taskResult.created;
    }
    const hospitalName = run?.client_name || analysis.hospital_name || "고객";
    const title = `${hospitalName} 미팅 후 브리핑`;
    const sections = [
      { key: "summary", title: "미팅 요약", items: [analysis.summary || memo?.summary || "요약 확인 필요"] },
      { key: "confirmed", title: "확정 사항", items: analysis.confirmedItems ?? [] },
      { key: "unresolved", title: "미확인 사항", items: analysis.unresolvedItems ?? [] },
      { key: "commitments", title: "약속", items: commitments },
      { key: "next_action", title: "다음 행동", items: nextAction ? [nextAction] : ["확인 필요"] },
    ];
    const { data: briefing, error: briefingError } = await db.from("olivia_briefings").upsert({
      briefing_type: "meeting_post",
      briefing_date: getKstDate(), title,
      summary: analysis.summary || `${hospitalName} 미팅 분석을 완료했습니다.`,
      sections,
      source_data: { memoId: body.memoId || memo?.id || null, clientId, workflowRunId: run?.id || null },
    }, { onConflict: "briefing_type,briefing_date,title" }).select("*").single();
    if (briefingError) throw new Error(briefingError.message);
    await emitOliviaEventSafely(db, {
      eventType: "meeting.analyzed", eventSource: "olivia_meeting_post_api", clientId, projectId: run?.project_id, workflowRunId: run?.id,
      actorType: "admin", payload: { memoId: body.memoId || memo?.id || null, commitmentCount: commitments.length, createdTaskCount: createdTasks.length },
      deduplicationKey: createEventDeduplicationKey("meeting.analyzed", body.memoId || memo?.id || briefing.id),
    });
    return NextResponse.json({ ok: true, data: { briefing, commitments, createdTasks }, briefing, commitments, createdTasks });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
