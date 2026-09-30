import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { draftInterviewPreparationInput } from "@/lib/voice/interview/server";
import { DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY, DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION } from "@/lib/voice/interview/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const limitValue = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 100) : 50;
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("voice_interview_preparations").select("*").order("updated_at", { ascending: false }).limit(limit);
    if (status === "ready" || status === "draft" || status === "recording" || status === "completed" || status === "canceled") {
      query = query.eq("status", status);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ preparations: data ?? [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("[voice/interviews/preparations:list]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 준비 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = draftInterviewPreparationInput(body);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("voice_interview_preparations").insert({
      ...input,
      template_key: DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY,
      template_version: DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION,
      status: "draft",
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ preparation: data }, { status: 201 });
  } catch (error) {
    console.error("[voice/interviews/preparations:create]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 준비를 만들지 못했습니다." }, { status: 500 });
  }
}
