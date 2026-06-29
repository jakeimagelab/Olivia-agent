import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ ok: false, error: "token 파라미터 필요" }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("video_conti_shares")
      .select("video_conti_id")
      .eq("token", token)
      .single();

    if (error || !data) return NextResponse.json({ ok: false, error: "유효하지 않은 토큰입니다" }, { status: 404 });
    return NextResponse.json({ ok: true, videoContiId: data.video_conti_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { videoContiId } = await req.json();
    if (!videoContiId) return NextResponse.json({ ok: false, error: "videoContiId 필요" }, { status: 400 });

    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    const db = getSupabaseAdmin();
    const { error } = await db.from("video_conti_shares").insert({ token, video_conti_id: videoContiId });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, token, url: `/video-conti/view/${token}` });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
