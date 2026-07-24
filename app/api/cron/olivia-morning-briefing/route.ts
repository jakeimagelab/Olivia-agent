import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateMorningBriefing, getKstDate } from "@/lib/olivia/briefings";
import { getErrorMessage } from "@/lib/errors";
import {
  deliverAssistantBriefingToKakao,
  renderBriefingText,
} from "@/lib/assistant/briefings/service";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin();
    const briefing = await generateMorningBriefing(db, getKstDate());
    const owner = await ensurePrimaryAssistantOwner(db);
    await db.from("olivia_briefings").update({ owner_id: owner.id }).eq("id", briefing.id);
    const delivery = await deliverAssistantBriefingToKakao(db, {
      owner,
      briefing,
      text: renderBriefingText({
        title: briefing.title,
        summary: briefing.summary,
        sections: Array.isArray(briefing.sections) ? briefing.sections : [],
      }),
    });
    return NextResponse.json({ ok: true, data: briefing, briefing, delivery });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
