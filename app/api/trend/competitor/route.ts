import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { industryOrDefault } from "@/lib/trend/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const hospitalName = (body.hospitalName || "").trim();
  if (!hospitalName) {
    return NextResponse.json({ ok: false, error: "병원명을 입력하세요." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trend_competitors")
    .insert({
      hospital_name: hospitalName,
      industry: industryOrDefault(body.industry),
      instagram_handle: (body.instagramHandle || "").trim().replace(/^@/, ""),
      youtube_channel_id: (body.youtubeChannelId || "").trim(),
      homepage_url: (body.homepageUrl || "").trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, competitor: data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { error } = await db.from("trend_competitors").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
