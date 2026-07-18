import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { emitOliviaEvent } from "@/lib/olivia/events";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);
  let query = db.from("olivia_events").select("*").order("occurred_at", { ascending: false }).limit(limit);
  if (params.get("status")) query = query.eq("event_status", params.get("status")!);
  if (params.get("type")) query = query.eq("event_type", params.get("type")!);
  if (params.get("workflowRunId")) query = query.eq("workflow_run_id", params.get("workflowRunId")!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], events: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.eventType || !body.eventSource) {
      return NextResponse.json({ ok: false, error: "eventType과 eventSource가 필요합니다." }, { status: 400 });
    }
    const event = await emitOliviaEvent(getSupabaseAdmin(), body);
    return NextResponse.json({ ok: true, data: event, event });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
