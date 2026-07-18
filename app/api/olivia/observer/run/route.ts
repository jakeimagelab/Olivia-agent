import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runOliviaObserver } from "@/lib/olivia/observer";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runOliviaObserver(getSupabaseAdmin(), {
      workflowRunId: body.workflowRunId ?? null,
      eventId: body.eventId ?? null,
      mode: body.mode === "single" ? "single" : "all_active",
    });
    return NextResponse.json({ ok: true, data: result, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
