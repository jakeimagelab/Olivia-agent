import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getSupabaseAdmin();

  // 서버가 UTC여도 한국 시간(KST) 기준 날짜를 사용
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const [mailingRes, clientsRes, ideaRes, memosRes, tasksRes] = await Promise.all([
    db.from("mailing_queue")
      .select("id, type, hospital_name, status, created_at")
      .in("status", ["draft", "ready", "failed"])
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("clients")
      .select("id, name, workflow_status, updated_at")
      .order("updated_at", { ascending: false }),
    db.from("daily_ideas")
      .select("date, marketing_idea, mission")
      .order("date", { ascending: false })
      .limit(1),
    db.from("consultation_memos")
      .select("id, raw_memo, created_at, hospital_id")
      .order("created_at", { ascending: false })
      .limit(5),
    db.from("calendar_tasks")
      .select("id, title, category, completed, date, time, location, memo")
      .eq("date", todayStr)
      .order("created_at", { ascending: true }),
  ]);

  const mailing = mailingRes.data ?? [];
  const clients = clientsRes.data ?? [];
  const idea    = ideaRes.data?.[0] ?? null;
  const memos   = memosRes.data ?? [];
  const todayTasks = tasksRes.data ?? [];

  const byStatus = (statuses: string[]) =>
    clients.filter(c => statuses.includes(c.workflow_status ?? ""));

  return NextResponse.json({
    ok: true,
    mailing: {
      pending: mailing.filter(m => m.status === "draft" || m.status === "ready"),
      failed:  mailing.filter(m => m.status === "failed"),
      recent:  mailing.slice(0, 8),
    },
    clients: {
      quoteFollowUp:    byStatus(["견적전달완료"]),
      contractPending:  byStatus(["계약전달대기", "계약생성"]),
      galleryPending:   byStatus(["갤러리생성", "갤러리전달대기"]),
      reviewPending:    byStatus(["갤러리전달완료", "리뷰요청대기"]),
      snsPending:       byStatus(["SNS콘텐츠화"]),
    },
    todayIdea:   idea,
    recentMemos: memos,
    todayTasks,
  });
}
