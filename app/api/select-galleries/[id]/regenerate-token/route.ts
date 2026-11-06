import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateShareToken } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getSupabaseAdmin();
    const { data: current, error: readError } = await db
      .from("select_galleries")
      .select("id,share_token_version")
      .eq("id", id)
      .single();
    if (readError || !current) return Response.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    const { data, error } = await db
      .from("select_galleries")
      .update({
        share_token: generateShareToken(),
        share_token_version: Number(current.share_token_version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("share_token_version", Number(current.share_token_version ?? 1))
      .select("id,share_token,share_token_version")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, gallery: data });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "토큰을 재발급하지 못했습니다." }, { status: 500 });
  }
}
