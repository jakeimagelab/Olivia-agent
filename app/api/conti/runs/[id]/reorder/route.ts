import { NextRequest, NextResponse } from "next/server";
import { reorderCanonicalContiScenes } from "@/lib/conti/canonicalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.orderedSceneIds) || body.orderedSceneIds.some((sceneId: unknown) => typeof sceneId !== "string")) {
    return NextResponse.json({ ok: false, error: "올바른 장면 순서가 필요합니다." }, { status: 400 });
  }
  try {
    const scenes = await reorderCanonicalContiScenes(id, body.orderedSceneIds);
    return NextResponse.json({ ok: true, scenes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "순서 저장에 실패했습니다." }, { status: 500 });
  }
}
