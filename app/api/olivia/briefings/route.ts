import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { generateMorningBriefing, getKstDate } from "@/lib/olivia/briefings";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 30, 1), 100);
  let query = getSupabaseAdmin().from("olivia_briefings").select("*").order("briefing_date", { ascending: false }).order("generated_at", { ascending: false }).limit(limit);
  if (params.get("type")) query = query.eq("briefing_type", params.get("type")!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [], briefings: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const briefing = await generateMorningBriefing(getSupabaseAdmin(), getKstDate());
    return NextResponse.json({ ok: true, data: briefing, briefing });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
