import { NextRequest, NextResponse } from "next/server";
import { deleteCanonicalContiScene, updateCanonicalContiScene } from "@/lib/conti/canonicalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 셀 편집(fields) → 해당 필드의 field_sources를 "user"로 갱신 (수정 즉시 학습 후보가 됨).
// 순서 변경(sort/group_id)만 보낼 때는 field_sources를 건드리지 않는다 — 위치 이동은 "고침"이 아니다.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  try {
    const scene = await updateCanonicalContiScene(id, body ?? {});
    return NextResponse.json({ ok: true, scene });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정 실패";
    return NextResponse.json({ ok: false, error: message }, { status: message === "장면을 찾을 수 없습니다." ? 404 : message === "수정할 내용이 없습니다." ? 400 : 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await deleteCanonicalContiScene(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
