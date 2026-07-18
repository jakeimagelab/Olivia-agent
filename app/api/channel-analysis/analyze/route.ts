import { NextRequest, NextResponse } from "next/server";
import { analyzeChannels } from "@/lib/channelAnalysis";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hospitalName = String(body.hospitalName || body.hospName || "분석 대상 병원").trim().slice(0, 100);
    const specialty = String(body.specialty || "").trim().slice(0, 100);
    const address = String(body.address || "").trim().slice(0, 250);
    const { urls, result } = await analyzeChannels({ hospitalName, specialty, urls: body.urls || {} });

    const row = {
      client_id: body.clientId || null,
      project_id: body.projectId || null,
      workflow_run_id: body.workflowRunId || null,
      hospital_name: hospitalName,
      specialty,
      address,
      input_urls: urls,
      overall_score: result.overall_score,
      overall_summary: result.overall_summary,
      photo_opportunity: result.photo_opportunity,
      channel_results: result.channels,
      report_data: result,
      collection_summary: result.collection_summary,
      analysis_status: result.analyzed_channels.some((key) => result.channels[key].status === "수집 실패") ? "partial" : "completed",
    };
    let reportId: string | null = null;
    let saveError = "";

    try {
      const { data: report, error } = await getSupabaseAdmin()
        .from("channel_analysis_reports")
        .insert(row)
        .select("id,created_at")
        .single();
      reportId = report?.id ?? null;
      saveError = error?.message || "";
    } catch (error) {
      saveError = error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json({ ok: true, result, reportId, saved: !saveError, saveError });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
