import { NextRequest, NextResponse } from "next/server";
import { getCanonicalConti, updateCanonicalContiRun } from "@/lib/conti/canonicalService";
import { normalizeContiStudioState } from "@/lib/conti/studioState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json(await getCanonicalConti(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "콘티를 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "run을 찾을 수 없습니다." ? 404 : 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const run = await updateCanonicalContiRun(id, {
      ...(body.studioState !== undefined ? { studioState: normalizeContiStudioState(body.studioState) } : {}),
      ...(body.hospitalId !== undefined ? { hospitalId: body.hospitalId || null } : {}),
      ...(body.workflowRunId !== undefined ? { workflowRunId: body.workflowRunId || null } : {}),
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "콘티 저장에 실패했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: /없습니다|필요합니다/.test(message) ? 400 : 500 });
  }
}
