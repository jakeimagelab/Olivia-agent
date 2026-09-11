import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderTemporaryDocumentPreview } from "@/lib/olivia/documents/renderTemporaryDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const preview = await renderTemporaryDocumentPreview(getSupabaseAdmin(), id);
    return NextResponse.json({ ok: true, url: preview.url, document: preview.document });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "미리보기 생성 실패" }, { status: 500 });
  }
}
