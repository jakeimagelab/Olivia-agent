import { NextRequest, NextResponse } from "next/server";
import { runTrendCollection } from "@/lib/trend/collect";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Vercel Cron 보안 검증 (기존 /api/cron/weekly-report와 동일 패턴)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await runTrendCollection();
  return NextResponse.json({ ok: true });
}
