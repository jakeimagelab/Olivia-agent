import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createTemporaryDocumentShare } from "@/lib/olivia/documents/temporaryDocumentShares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "https://olivia.photoclinic.kr";
    const share = await createTemporaryDocumentShare(getSupabaseAdmin(), id, baseUrl);
    return NextResponse.json({ ok: true, ...share });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "미리보기 링크 발급 실패" }, { status: 500 });
  }
}
