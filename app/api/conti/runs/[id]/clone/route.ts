import { NextResponse } from "next/server";
import { cloneCanonicalConti } from "@/lib/conti/canonicalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await cloneCanonicalConti(id));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "콘티 복제에 실패했습니다." }, { status: 500 });
  }
}
