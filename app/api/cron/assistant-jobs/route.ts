import { NextRequest, NextResponse } from "next/server";
import { processAssistantJobs } from "@/lib/assistant/jobs/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  try {
    const results = await processAssistantJobs({
      db: getSupabaseAdmin(),
      req,
      workerId: `cron-${crypto.randomUUID()}`,
      limit: 10,
    });
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "비동기 작업 처리 실패",
      },
      { status: 500 },
    );
  }
}
