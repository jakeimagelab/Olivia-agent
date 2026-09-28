import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runHealthChecks({ db: getSupabaseAdmin(), groups: ["mac_studio", "chat"] });
  return NextResponse.json({ ok: true, ...result });
}
