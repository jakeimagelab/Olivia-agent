import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeChannels, assertSafeChannelUrl } from "@/lib/channelAnalysis";
import type { DiagnosisChannel, SourceStatus } from "@/lib/hospitalBrandDiagnosis/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 기존 채널 분석 엔진(lib/channelAnalysis.ts)이 다루지 않는 유튜브 채널 페이지만
// 최소한으로 직접 수집한다 — 영상 정밀 분석은 1차 범위에서 제외(섹션 34).
async function collectYoutubeSnapshot(url: string) {
  await assertSafeChannelUrl(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; HospitalBrandDiagnosis/1.0)" },
  });
  if (!res.ok) throw new Error(`채널 페이지 수집 실패 (${res.status})`);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return { ok: Boolean(title), title, description: descMatch?.[1] || "" };
}

function evidenceFromSnapshot(channel: DiagnosisChannel, snapshot: any): { statement: string; confidence: "high" | "medium" }[] {
  const items: { statement: string; confidence: "high" | "medium" }[] = [];
  if (!snapshot) return items;
  if (snapshot.title) items.push({ statement: `${snapshot.title}가 페이지 제목으로 확인됩니다.`, confidence: "high" });
  if (snapshot.description) items.push({ statement: "메타 설명(또는 채널 소개) 문구가 확인됩니다.", confidence: "high" });
  if (Array.isArray(snapshot.headings) && snapshot.headings.length > 0) {
    items.push({ statement: `본문 제목(H1~H3) ${snapshot.headings.length}개가 확인됩니다: ${snapshot.headings.slice(0, 3).join(" / ")}`, confidence: "high" });
  }
  if (typeof snapshot.imageCount === "number" && snapshot.imageCount > 0) {
    const altRatio = snapshot.altCount ? Math.round((snapshot.altCount / snapshot.imageCount) * 100) : 0;
    items.push({ statement: `이미지 ${snapshot.imageCount}개 중 ALT 텍스트가 있는 이미지는 ${snapshot.altCount ?? 0}개(${altRatio}%)입니다.`, confidence: "high" });
  }
  if (snapshot.hasJsonLd) items.push({ statement: "구조화 데이터(JSON-LD)가 페이지에 포함되어 있습니다.", confidence: "high" });
  return items;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const diagnosisId = String(body.diagnosisId || "");
    if (!diagnosisId) return NextResponse.json({ ok: false, error: "diagnosisId가 필요합니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses").select("id, hospital_name, specialty").eq("id", diagnosisId).maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });

    const { data: sources, error: sourcesError } = await supabase
      .from("hospital_brand_diagnosis_sources").select("*").eq("diagnosis_id", diagnosisId);
    if (sourcesError) throw new Error(sourcesError.message);

    await supabase.from("hospital_brand_diagnoses").update({ status: "collecting" }).eq("id", diagnosisId);

    const urlSources = (sources ?? []).filter((s) => s.url && s.url.trim());
    const channelMap: Partial<Record<DiagnosisChannel, string>> = {};
    for (const s of urlSources) channelMap[s.channel as DiagnosisChannel] = s.url;

    // lib/channelAnalysis.ts가 지원하는 4개 채널만 골라 기존 엔진을 그대로 호출한다.
    const enginePayload = {
      web: channelMap.website, naver: channelMap.naver_place, blog: channelMap.naver_blog, insta: channelMap.instagram,
    };
    const hasEngineChannel = Object.values(enginePayload).some(Boolean);

    let engineResult: Awaited<ReturnType<typeof analyzeChannels>> | null = null;
    let engineError: string | null = null;
    if (hasEngineChannel) {
      try {
        engineResult = await analyzeChannels({
          hospitalName: diagnosis.hospital_name, specialty: diagnosis.specialty, urls: enginePayload,
        });
      } catch (error) {
        engineError = error instanceof Error ? error.message : "채널 자동 분석 실패";
      }
    }

    const results: { channel: DiagnosisChannel; status: SourceStatus; limitations: string[] }[] = [];

    const applyResult = async (
      channel: DiagnosisChannel,
      snapshot: any,
      snapshotOk: boolean | undefined,
      failureNote: string
    ) => {
      const source = urlSources.find((s) => s.channel === channel);
      if (!source) return;

      let status: SourceStatus;
      const limitations: string[] = [];
      if (!snapshot || snapshotOk === false) {
        status = "manual_required";
        limitations.push(failureNote);
      } else {
        const textLength = snapshot.textLength ?? (snapshot.description ? 200 : 0);
        const hasHeadings = Array.isArray(snapshot.headings) && snapshot.headings.length > 0;
        status = textLength >= 300 || hasHeadings ? "complete" : "partial";
        if (status === "partial") limitations.push("자동 수집된 정보가 제한적입니다. 화면 캡처를 추가하면 더 정확하게 분석할 수 있습니다.");
      }

      const evidenceRows = evidenceFromSnapshot(channel, snapshot);
      if (evidenceRows.length > 0) {
        await supabase.from("hospital_brand_diagnosis_evidence").insert(
          evidenceRows.map((e) => ({
            diagnosis_id: diagnosisId, channel, statement: e.statement,
            source_type: "html", reference: source.url, confidence: e.confidence,
          }))
        );
      }

      await supabase.from("hospital_brand_diagnosis_sources").update({
        status, evidence_count: evidenceRows.length, limitations_json: limitations,
        snapshot_json: snapshot ?? null, collected_at: new Date().toISOString(),
      }).eq("id", source.id);

      results.push({ channel, status, limitations });
    };

    const collectionSummary = engineResult?.result?.collection_summary as Record<string, any> | undefined;
    if (channelMap.website) {
      await applyResult("website", collectionSummary?.web, collectionSummary?.web?.ok,
        engineError || "홈페이지 자동 수집에 실패했습니다. 화면 캡처를 추가해주세요.");
    }
    if (channelMap.naver_place) {
      await applyResult("naver_place", collectionSummary?.naver, collectionSummary?.naver?.ok,
        engineError || "네이버 플레이스 자동 수집에 실패했습니다. 화면 캡처를 추가해주세요.");
    }
    if (channelMap.naver_blog) {
      await applyResult("naver_blog", collectionSummary?.blog, collectionSummary?.blog?.ok,
        engineError || "블로그 자동 수집에 실패했습니다. 화면 캡처를 추가해주세요.");
    }
    if (channelMap.instagram) {
      const insta = collectionSummary?.instagram;
      await applyResult("instagram", insta, insta?.ok,
        insta?.error === "APIFY_TOKEN 미설정"
          ? "인스타그램의 자동 분석이 제한되었습니다. 프로필과 최근 게시물이 보이는 화면 캡처를 추가하면 분석을 계속할 수 있습니다."
          : (engineError || "인스타그램 자동 수집에 실패했습니다. 화면 캡처를 추가해주세요."));
    }
    if (channelMap.youtube) {
      const source = urlSources.find((s) => s.channel === "youtube");
      try {
        const snapshot = await collectYoutubeSnapshot(channelMap.youtube);
        await applyResult("youtube", snapshot, snapshot.ok, "채널 페이지 정보를 확인하지 못했습니다. 채널 홈과 최근 영상 목록 화면 캡처를 추가해주세요.");
      } catch (error) {
        if (source) {
          const message = error instanceof Error ? error.message : "유튜브 채널 수집 실패";
          await supabase.from("hospital_brand_diagnosis_sources").update({
            status: "manual_required",
            limitations_json: [`${message} 채널 홈과 최근 영상 목록 화면 캡처를 추가해주세요.`],
          }).eq("id", source.id);
          results.push({ channel: "youtube", status: "manual_required", limitations: [message] });
        }
      }
    }

    // 남은 채널(URL 없이 업로드로만 진행하기로 한 채널)은 manual_required로 표시한다.
    for (const source of sources ?? []) {
      if (!source.url && source.status === "pending") {
        await supabase.from("hospital_brand_diagnosis_sources").update({ status: "manual_required" }).eq("id", source.id);
        results.push({ channel: source.channel, status: "manual_required", limitations: [] });
      }
    }

    const anyManual = results.some((r) => r.status === "manual_required" || r.status === "partial");
    await supabase.from("hospital_brand_diagnoses")
      .update({ status: anyManual ? "waiting_manual_upload" : "collecting" }).eq("id", diagnosisId);

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "채널 자료 수집 실패" }, { status: 500 });
  }
}
