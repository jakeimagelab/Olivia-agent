import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from("channel_analysis_reports").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || "리포트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, report: data, result: data.report_data });
}
