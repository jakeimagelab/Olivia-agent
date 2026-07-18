import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getKstDate } from "@/lib/olivia/briefings";
import { prepareMeetingBriefing } from "@/lib/olivia/meetingAssistant";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.calendarTaskId) {
      const result = await prepareMeetingBriefing(getSupabaseAdmin(), {
        calendarTaskId: body.calendarTaskId,
        workflowRunId: body.workflowRunId,
      });
      return NextResponse.json({ ok: true, data: result.briefing, briefing: result.briefing, requiresConnection: result.requiresConnection });
    }
    if (!body.clientId) return NextResponse.json({ ok: false, error: "clientId가 필요합니다." }, { status: 400 });
    const db = getSupabaseAdmin();
    const runQuery = body.workflowRunId
      ? db.from("workflow_runs").select("*").eq("id", body.workflowRunId).maybeSingle()
      : db.from("workflow_runs").select("*").eq("client_id", body.clientId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const [clientRes, runRes, memosRes, commitmentsRes, quotesRes] = await Promise.all([
      db.from("clients").select("*").eq("id", body.clientId).maybeSingle(),
      runQuery,
      db.from("consultation_memos").select("id,summary,extracted_data,recommended_package,next_action,created_at").eq("hospital_id", body.clientId).order("created_at", { ascending: false }).limit(5),
      db.from("meeting_commitments").select("*").eq("client_id", body.clientId).in("status", ["open", "overdue"]).order("due_at"),
      db.from("quotes").select("id,quote_number,hospital_name,total_amount,shoot_date,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (clientRes.error) throw new Error(clientRes.error.message);
    const client = clientRes.data;
    const run = runRes.data;
    const hospitalName = client?.hospital_name || client?.name || run?.client_name || "고객";
    const quotes = (quotesRes.data ?? []).filter((quote) => quote.hospital_name === hospitalName).slice(0, 3);
    const latestMemo = memosRes.data?.[0] ?? null;
    const extracted = latestMemo?.extracted_data || {};
    const sections = [
      { key: "client", title: "고객 기본 정보", items: [{ hospitalName, specialty: client?.specialty || client?.department || "확인 필요", manager: client?.contact_name || client?.manager_name || "확인 필요" }] },
      { key: "recent_consultation", title: "최근 상담", items: latestMemo ? [latestMemo] : [{ summary: "최근 상담 기록 확인 필요" }] },
      { key: "workflow", title: "현재 진행", items: [{ currentStepKey: run?.current_step_key || "미시작", nextAction: run?.next_action || "확인 필요" }] },
      { key: "commitments", title: "열린 약속", items: commitmentsRes.data ?? [] },
      { key: "quotes", title: "이전 견적", items: quotes },
      { key: "questions", title: "오늘 확인할 질문", items: [
        ...(extracted.unresolvedItems ?? []).map((text: string) => ({ text })),
        ...(!extracted.decisionMaker ? [{ text: "최종 의사결정권자를 확인하세요." }] : []),
        ...(!extracted.desiredSchedule ? [{ text: "희망 촬영 일정을 확인하세요." }] : []),
      ] },
    ];
    const title = `${hospitalName} 미팅 전 브리핑`;
    const { data: briefing, error } = await db.from("olivia_briefings").upsert({
      briefing_type: "meeting_pre",
      briefing_date: getKstDate(body.meetingAt ? new Date(body.meetingAt) : new Date()),
      title,
      summary: `${hospitalName} 미팅에서 열린 질문과 약속을 우선 확인하세요.`,
      sections,
      source_data: { clientId: body.clientId, workflowRunId: run?.id ?? null, meetingAt: body.meetingAt ?? null },
    }, { onConflict: "briefing_type,briefing_date,title" }).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data: briefing, briefing });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
