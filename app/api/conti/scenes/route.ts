import { NextRequest, NextResponse } from "next/server";
import { addCanonicalContiScene } from "@/lib/conti/canonicalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 결과 표의 "장면 추가" — 템플릿 없이 빈 장면 한 줄을 맨 끝에 추가한다. 전부 blank로 시작해서
// 사용자가 직접 채우면 해당 필드가 user로 바뀐다(수정 시 PATCH /api/conti/scenes/[id]가 처리).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { runId, groupId } = body ?? {};
  if (!runId) {
    return NextResponse.json({ ok: false, error: "runId가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, scene: await addCanonicalContiScene(runId, groupId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "장면 추가 실패" }, { status: 500 });
  }
}
