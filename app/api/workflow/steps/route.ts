import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 단계 정의는 코드(WORKFLOW_STEPS)가 단일 소스 — DB 조회 불필요
  return NextResponse.json({ ok: true, steps: WORKFLOW_STEPS });
}
