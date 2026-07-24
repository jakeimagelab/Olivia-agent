import { NextRequest, NextResponse } from "next/server";
import {
  deliverAssistantBriefingToKakao,
  generateAssistantBriefing,
} from "@/lib/assistant/briefings/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin();
    const generated = await generateAssistantBriefing(db, "afternoon");
    const delivery = await deliverAssistantBriefingToKakao(db, generated);
    return NextResponse.json({ ok: true, briefing: generated.briefing, delivery });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "브리핑 생성 실패" },
      { status: 500 },
    );
  }
}
