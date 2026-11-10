import { NextRequest, NextResponse } from "next/server";
import { isGeoRadarSchemaMissing, geoRadarSetupResponse } from "@/lib/ai-trust/database";
import { runAiTrustWorkerBatch } from "@/lib/ai-trust/worker";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await runAiTrustWorkerBatch(getSupabaseAdmin());
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    if (isGeoRadarSchemaMissing(error)) return NextResponse.json(geoRadarSetupResponse(error), { status: 503 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "GEO 레이더 작업 처리 실패" }, { status: 500 });
  }
}
