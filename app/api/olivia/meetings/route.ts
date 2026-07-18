import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  analyzeMeetingMemo,
  completeMeeting,
  getMeetingFollowups,
  linkMeetingClient,
  listMeetingMemos,
  listUpcomingMeetings,
  meetingCandidateToWorkItem,
  meetingCandidateSelectionItems,
  prepareMeetingBriefing,
} from "@/lib/olivia/meetingAssistant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const meetings = await listUpcomingMeetings(getSupabaseAdmin(), {
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      days: Number(params.get("days") || 2),
      query: params.get("query") || undefined,
    });
    return NextResponse.json({ ok: true, meetings: meetings.flatMap((meeting) => [meetingCandidateToWorkItem(meeting), ...meetingCandidateSelectionItems(meeting)]) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "미팅 조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const body = await request.json();
    if (body.action === "link") {
      const candidate = await linkMeetingClient(db, body.calendarTaskId, body.workflowRunId);
      return NextResponse.json({ ok: true, message: "고객 프로젝트를 연결했습니다.", workItems: [meetingCandidateToWorkItem(candidate)] });
    }
    if (body.action === "brief") {
      const result = await prepareMeetingBriefing(db, body);
      return NextResponse.json({ ok: true, message: result.requiresConnection ? "연결할 고객 프로젝트를 선택해주세요." : "미팅 전 브리핑을 준비했습니다.", briefing: result.briefing, workItems: [meetingCandidateToWorkItem(result.candidate)] });
    }
    if (body.action === "complete") {
      await completeMeeting(db, body.calendarTaskId);
      const workItems = await listMeetingMemos(db, body);
      return NextResponse.json({ ok: true, message: "미팅을 완료 처리했습니다.", workItems });
    }
    if (body.action === "analyze") {
      if (!body.memoId) {
        const workItems = await listMeetingMemos(db, body);
        return NextResponse.json({ ok: true, message: workItems.length ? "분석할 메모를 선택해주세요." : "분석할 메모가 없습니다.", workItems });
      }
      const result = await analyzeMeetingMemo(db, body);
      return NextResponse.json({ ok: true, message: "미팅 메모 분석을 완료했습니다.", result, workItems: body.workflowRunId ? await getMeetingFollowups(db, body.workflowRunId) : [] });
    }
    if (body.action === "followups") {
      return NextResponse.json({ ok: true, workItems: await getMeetingFollowups(db, body.workflowRunId) });
    }
    return NextResponse.json({ ok: false, error: "지원하지 않는 미팅 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "미팅 처리 실패" }, { status: 500 });
  }
}
