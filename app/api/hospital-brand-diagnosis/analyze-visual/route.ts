import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { downloadAssetAsBase64 } from "@/lib/hospitalBrandDiagnosis/storage";
import { HBD_SYSTEM_PRINCIPLES, stripForbiddenPhrases } from "@/lib/hospitalBrandDiagnosis/config";
import type { VideoAnalysisSummary, VisualCategory } from "@/lib/hospitalBrandDiagnosis/types";
import { isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const VISUAL_CATEGORIES: VisualCategory[] = [
  "doctor_profile", "staff_group", "consultation", "treatment", "examination", "medical_equipment",
  "interior", "exterior", "wayfinding", "patient_information", "graphic_card", "product", "video_thumbnail", "other",
];

const IMAGE_MIME_TO_CLAUDE: Record<string, string> = {
  "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp",
};

function buildImagePrompt() {
  return `${HBD_SYSTEM_PRINCIPLES}

첨부된 이미지 1장을 분석하라. 이 이미지는 병원이 채널에 사용 중인 사진이다.
반드시 아래 JSON 형식으로만 응답하라 (다른 텍스트 금지):

{
  "category": "doctor_profile|staff_group|consultation|treatment|examination|medical_equipment|interior|exterior|wayfinding|patient_information|graphic_card|product|video_thumbnail|other",
  "subjects": "등장 인물 또는 사물",
  "location": "촬영 장소로 보이는 곳",
  "action": "장면에서 일어나는 행동",
  "equipment": "보이는 장비 (없으면 빈 문자열)",
  "sceneMeaning": "이 장면이 전달하는 의미 1~2문장",
  "keyVisualElements": "주요 시각 요소",
  "hasRealHospitalInfo": true,
  "selfExplanatory": true,
  "suitableChannels": ["website"],
  "textReadability": "이미지 안에 텍스트가 있다면 가독성 평가, 없으면 '해당 없음'",
  "analysisNote": "이 이미지를 현재 채널에서 더 잘 활용하는 방법 2~3문장 (재배치·캡션·순서 변경 등, 촬영 추천 금지)"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const diagnosisId = String(body.diagnosisId || "");
    if (!isUuid(diagnosisId)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const supabase = getSupabaseAdmin();
    let assetQuery = supabase.from("hospital_brand_diagnosis_assets").select("*").eq("diagnosis_id", diagnosisId);
    if (Array.isArray(body.assetIds) && body.assetIds.length > 0) {
      assetQuery = assetQuery.in("id", body.assetIds);
    } else {
      assetQuery = assetQuery.is("analysis_json", null);
    }
    const { data: assets, error: assetsError } = await assetQuery;
    if (assetsError) throw new Error(assetsError.message);
    if (!assets || assets.length === 0) return NextResponse.json({ ok: true, analyzed: [] });

    const analyzed: { assetId: string; ok: boolean; error?: string }[] = [];

    for (const asset of assets) {
      const claudeMime = IMAGE_MIME_TO_CLAUDE[asset.mime_type];
      if (!claudeMime) {
        // 영상 자체는 이 API가 정밀 분석하지 않는다 — 클라이언트가 업로드 직후 브라우저에서
        // 주요 프레임을 추출해 별도 이미지로 올리고, 그 결과(VideoAnalysisSummary)를 이미
        // analysis_json에 기록해뒀다면 그대로 존중한다(덮어써서 상태를 잃지 않도록).
        // 클라이언트 추출이 실패했거나 시도되지 않은 영상만 "unsupported"로 명시한다.
        const existingSummary = asset.analysis_json as VideoAnalysisSummary | null;
        if (!existingSummary || !existingSummary.status || existingSummary.status === "not_requested") {
          const fallback: VideoAnalysisSummary = {
            status: "unsupported",
            thumbnailAnalyzed: false,
            subtitleAnalyzed: false,
            titleAnalyzed: true,
            limitations: ["이 영상은 브라우저에서 주요 프레임을 추출하지 못해 참고 자료로만 저장되었습니다. 영상 전체 내용에 대한 AI 분석은 제공하지 않습니다."],
          };
          await supabase.from("hospital_brand_diagnosis_assets").update({ analysis_json: fallback }).eq("id", asset.id);
        }
        await supabase.from("hospital_brand_diagnosis_evidence").insert({
          diagnosis_id: diagnosisId, channel: asset.channel,
          statement: `${asset.file_name}은 영상 파일로, 제목과 추출된 주요 프레임을 기준으로만 참고합니다.`,
          source_type: "uploaded_video", source_id: asset.id, confidence: "low",
        });
        analyzed.push({ assetId: asset.id, ok: true });
        continue;
      }

      try {
        const base64 = await downloadAssetAsBase64(supabase, asset.storage_path);
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 900,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: claudeMime, data: base64 } },
                { type: "text", text: buildImagePrompt() },
              ],
            }],
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || "이미지 분석 API 오류");
        const text: string = data.content?.[0]?.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("이미지 분석 결과를 파싱하지 못했습니다.");
        const parsed = JSON.parse(match[0]);

        const category: VisualCategory = VISUAL_CATEGORIES.includes(parsed.category) ? parsed.category : "other";
        const analysisNote = stripForbiddenPhrases(String(parsed.analysisNote || ""));

        await supabase.from("hospital_brand_diagnosis_assets").update({
          category, analysis_json: { ...parsed, category, analysisNote },
        }).eq("id", asset.id);

        await supabase.from("hospital_brand_diagnosis_evidence").insert({
          diagnosis_id: diagnosisId, channel: asset.channel,
          statement: stripForbiddenPhrases(String(parsed.sceneMeaning || `${asset.file_name}은 ${category} 유형으로 분류되었습니다.`)),
          source_type: "uploaded_image", source_id: asset.id, confidence: "medium",
        });

        analyzed.push({ assetId: asset.id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "이미지 분석 실패";
        await supabase.from("hospital_brand_diagnosis_assets").update({
          analysis_json: { error: message },
        }).eq("id", asset.id);
        analyzed.push({ assetId: asset.id, ok: false, error: message });
      }
    }

    return NextResponse.json({ ok: true, analyzed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "이미지·영상 분석 실패" }, { status: 500 });
  }
}
