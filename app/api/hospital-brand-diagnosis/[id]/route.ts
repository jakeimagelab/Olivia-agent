import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { DiagnosisChannel, DiagnosisProgressStatus } from "@/lib/hospitalBrandDiagnosis/types";
import { escapeList, escapeText, isPlausibleHttpUrl, isUuid, isValidChannel } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES: DiagnosisProgressStatus[] = [
  "draft", "collecting", "waiting_manual_upload", "analyzing", "completed", "failed",
];

// GET — 새로고침 후 이어서 진행하거나 결과를 볼 때 전체 데이터를 한 번에 반환한다 (섹션 33).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });
    const supabase = getSupabaseAdmin();

    const [diagnosisRes, sourcesRes, assetsRes, channelResultsRes, evidenceRes] = await Promise.all([
      supabase.from("hospital_brand_diagnoses").select("*").eq("id", id).maybeSingle(),
      supabase.from("hospital_brand_diagnosis_sources").select("*").eq("diagnosis_id", id).order("created_at", { ascending: true }),
      supabase.from("hospital_brand_diagnosis_assets").select("id, channel, category, file_name, storage_path, mime_type, file_size, width, height, duration, consent, analysis_json, created_at").eq("diagnosis_id", id).order("created_at", { ascending: true }),
      supabase.from("hospital_brand_diagnosis_channel_results").select("*").eq("diagnosis_id", id),
      supabase.from("hospital_brand_diagnosis_evidence").select("*").eq("diagnosis_id", id).order("created_at", { ascending: true }),
    ]);

    if (diagnosisRes.error) throw new Error(diagnosisRes.error.message);
    if (!diagnosisRes.data) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });
    if (sourcesRes.error) throw new Error(sourcesRes.error.message);
    if (assetsRes.error) throw new Error(assetsRes.error.message);
    if (channelResultsRes.error) throw new Error(channelResultsRes.error.message);
    if (evidenceRes.error) throw new Error(evidenceRes.error.message);

    return NextResponse.json({
      ok: true,
      diagnosis: diagnosisRes.data,
      sources: sourcesRes.data ?? [],
      assets: assetsRes.data ?? [],
      channelResults: channelResultsRes.data ?? [],
      evidence: evidenceRes.data ?? [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "진단 조회 실패" }, { status: 500 });
  }
}

// PATCH — 단계별 중간 저장: 프로필 수정, 상태 변경, 채널 선택(sources 생성/갱신) 등.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: existing, error: findError } = await supabase
      .from("hospital_brand_diagnoses").select("id, profile_json").eq("id", id).maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!existing) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ ok: false, error: "status 값이 올바르지 않습니다." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.profilePatch && typeof body.profilePatch === "object") {
      const p = body.profilePatch as Record<string, unknown>;
      const cleanedPatch: Record<string, unknown> = {};
      if (p.desiredImages !== undefined) cleanedPatch.desiredImages = escapeList(p.desiredImages);
      if (p.coreStrengths !== undefined) cleanedPatch.coreStrengths = escapeList(p.coreStrengths);
      if (p.currentConcerns !== undefined) cleanedPatch.currentConcerns = escapeList(p.currentConcerns);
      if (p.primaryTreatments !== undefined) cleanedPatch.primaryTreatments = escapeList(p.primaryTreatments);
      if (p.targetPatients !== undefined) cleanedPatch.targetPatients = escapeList(p.targetPatients);
      if (p.region !== undefined) cleanedPatch.region = escapeText(p.region, 120);
      patch.profile_json = { ...(existing.profile_json as object ?? {}), ...cleanedPatch };
    }
    if (body.overallSummary !== undefined) patch.overall_summary = escapeText(body.overallSummary, 4000);
    if (body.reportJson !== undefined) patch.report_json = body.reportJson;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("hospital_brand_diagnoses").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    // 채널 선택(STEP3) — 선택한 채널마다 sources row를 없으면 만들고 URL만 갱신한다.
    if (Array.isArray(body.channels)) {
      if (body.channels.length > HBD_VALID_CHANNELS_LIMIT) {
        return NextResponse.json({ ok: false, error: "채널은 최대 6개까지 선택할 수 있습니다." }, { status: 400 });
      }
      const channels: { channel: DiagnosisChannel; url?: string }[] = [];
      for (const raw of body.channels as unknown[]) {
        const entry = raw as { channel?: unknown; url?: unknown };
        if (!isValidChannel(entry.channel)) {
          return NextResponse.json({ ok: false, error: "채널 값이 올바르지 않습니다." }, { status: 400 });
        }
        const url = entry.url ? String(entry.url).trim() : "";
        if (url && !isPlausibleHttpUrl(url)) {
          return NextResponse.json({ ok: false, error: `${entry.channel} 채널의 URL 형식이 올바르지 않습니다.` }, { status: 400 });
        }
        channels.push({ channel: entry.channel, url });
      }

      const { data: currentSources, error: sourcesError } = await supabase
        .from("hospital_brand_diagnosis_sources").select("id, channel").eq("diagnosis_id", id);
      if (sourcesError) throw new Error(sourcesError.message);

      const existingByChannel = new Map((currentSources ?? []).map((s) => [s.channel, s.id]));
      for (const entry of channels) {
        const existingId = existingByChannel.get(entry.channel);
        if (existingId) {
          const { error } = await supabase.from("hospital_brand_diagnosis_sources")
            .update({ url: entry.url ?? "" }).eq("id", existingId);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase.from("hospital_brand_diagnosis_sources").insert({
            diagnosis_id: id,
            channel: entry.channel,
            url: entry.url ?? "",
            collection_method: entry.url ? "html" : "uploaded_image",
            status: "pending",
          });
          if (error) throw new Error(error.message);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "진단 수정 실패" }, { status: 500 });
  }
}
