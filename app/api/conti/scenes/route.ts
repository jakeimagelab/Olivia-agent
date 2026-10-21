import { NextRequest, NextResponse } from "next/server";
import { addCanonicalContiScene } from "@/lib/conti/canonicalService";
import { parseContiSceneRecommendation } from "@/lib/conti/sceneRecommendations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 결과 표의 "장면 추가" — 추천 장면이면 검증한 값으로, 추천이 없으면 빈 장면으로 추가한다.
// 사용자가 이후 직접 고친 필드는 PATCH /api/conti/scenes/[id]에서 user 출처로 바뀐다.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { runId, groupId } = body ?? {};
  if (!runId) {
    return NextResponse.json({ ok: false, error: "runId가 필요합니다." }, { status: 400 });
  }

  try {
    const scene = body?.scene === undefined ? undefined : parseContiSceneRecommendation(body.scene);
    if (body?.scene !== undefined && !scene) return NextResponse.json({ ok: false, error: "추가할 장면 정보가 올바르지 않습니다." }, { status: 400 });
    return NextResponse.json({ ok: true, scene: await addCanonicalContiScene(runId, groupId, scene) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "장면 추가 실패" }, { status: 500 });
  }
}
