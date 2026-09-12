import { NextRequest, NextResponse } from "next/server";
import { importCanonicalConti } from "@/lib/conti/canonicalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await importCanonicalConti({
      hospitalId: body.hospitalId,
      hospitalName: body.hospitalName,
      workflowRunId: body.workflowRunId,
      title: body.title,
      conti: body.conti,
      checklist: body.checklist,
      schedule: body.schedule,
    }));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "콘티 가져오기에 실패했습니다." }, { status: 500 });
  }
}
