import { NextRequest, NextResponse } from "next/server";
import { getCanonicalConti } from "@/lib/conti/canonicalService";

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
