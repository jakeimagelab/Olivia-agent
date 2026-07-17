import { NextResponse } from "next/server";
import { ACTIVE_WORKFLOW_STEPS, WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 신규 실행용 12단계를 기본으로 제공하고 레거시 해석용 카탈로그는 별도 필드로 둔다.
  return NextResponse.json({ ok: true, steps: ACTIVE_WORKFLOW_STEPS, legacyCatalog: WORKFLOW_STEPS });
}
