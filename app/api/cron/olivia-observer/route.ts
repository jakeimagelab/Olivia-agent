import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_RUNS_PER_EXECUTION, runOliviaObserver } from "@/lib/olivia/observer";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  try {
    const { data: events } = await db.from("olivia_events").select("id").eq("event_status", "pending").not("workflow_run_id", "is", null).order("occurred_at").limit(10);
    const total = { checkedRuns: 0, createdInsights: 0, createdActions: 0, skippedDuplicates: 0, failedRuns: 0 };
    for (const event of events ?? []) {
      const result = await runOliviaObserver(db, { eventId: event.id, mode: "single" });
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    }
    const remaining = Math.max(MAX_RUNS_PER_EXECUTION - total.checkedRuns, 0);
    if (remaining) {
      const result = await runOliviaObserver(db, { mode: "all_active", limit: remaining });
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    }
    return NextResponse.json({ ok: true, data: total, ...total });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
