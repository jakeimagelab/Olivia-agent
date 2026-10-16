import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeWav, type BgmSection, VIDEO_CONTI_BGM_BUCKET } from "@/lib/video-conti/bgm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enrichSectionsWithClaude(sections: BgmSection[], brandAnalysis: { brandName?: unknown; oneLiner?: unknown; shootingDirection?: unknown } | null, apiKey: string): Promise<BgmSection[]> {
  const energyProfile = sections.map((section) => `구간 ${section.index + 1} (${section.startSec}s-${section.endSec}s): 에너지=${section.energyLevel}, RMS=${section.rmsEnergy}`).join("\n");
  const brandContext = brandAnalysis
    ? `브랜드명: ${brandAnalysis.brandName ?? ""}\n한줄요약: ${brandAnalysis.oneLiner ?? ""}\n촬영방향: ${brandAnalysis.shootingDirection ?? ""}`
    : "브랜드 정보 없음";
  const prompt = `당신은 영상 음악 전문가입니다. 아래 BGM 에너지 프로파일과 브랜드 정보를 바탕으로 각 구간에 어울리는 테마와 악기 구성을 제안해주세요.

브랜드 정보:
${brandContext}

BGM 에너지 프로파일:
${energyProfile}

각 구간에 대해 JSON 배열로만 응답하세요 (다른 텍스트 없이):
[
  { "index": 0, "suggestedTheme": "오프닝 - 차분한 시작", "instrumentation": "피아노, 스트링 (약하게)" },
  ...
]`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }) });
    const payload = await response.json() as { content?: Array<{ text?: string }> };
    const match = (payload.content?.[0]?.text ?? "").match(/\[[\s\S]*\]/);
    if (!match) return sections;
    const enriched = JSON.parse(match[0]) as Array<{ index: number; suggestedTheme: string; instrumentation: string }>;
    return sections.map((section) => {
      const entry = enriched.find((candidate) => candidate.index === section.index);
      return entry ? { ...section, suggestedTheme: entry.suggestedTheme, instrumentation: entry.instrumentation } : section;
    });
  } catch {
    return sections;
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => null) as { videoContiId?: unknown; storagePath?: unknown; fileName?: unknown } | null;
    const videoContiId = typeof body?.videoContiId === "string" ? body.videoContiId.trim() : "";
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    if (!videoContiId || !storagePath || !fileName) return NextResponse.json({ ok: false, error: "videoContiId, storagePath, fileName이 필요합니다" }, { status: 400 });
    if (!storagePath.startsWith(`${videoContiId}/`) || storagePath.includes("..") || storagePath.includes("\\")) return NextResponse.json({ ok: false, error: "허용되지 않은 Storage 경로입니다" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: storedFile, error: downloadError } = await supabase.storage.from(VIDEO_CONTI_BGM_BUCKET).download(storagePath);
    if (downloadError || !storedFile) throw downloadError || new Error("업로드 파일을 읽지 못했습니다");
    const buffer = Buffer.from(await storedFile.arrayBuffer());
    let sections: BgmSection[] = [];
    let durationSeconds = 0;
    let note: string | undefined;
    if (fileName.toLowerCase().endsWith(".wav")) {
      const analyzed = analyzeWav(buffer);
      sections = analyzed.sections;
      durationSeconds = analyzed.durationSeconds;
      note = analyzed.note;
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      if (apiKey && sections.length) {
        const { data: row } = await supabase.from("video_conti").select("brand_analysis").eq("id", videoContiId).single();
        sections = await enrichSectionsWithClaude(sections, row?.brand_analysis ?? null, apiKey);
      }
    } else {
      note = "WAV 파일만 상세 분석이 가능합니다";
    }
    const { error: updateError } = await supabase.from("video_conti").update({ bgm_filename: fileName, bgm_storage_path: storagePath, bgm_duration_seconds: durationSeconds || null, bgm_tempo_bpm: null, bgm_sections: sections, updated_at: new Date().toISOString() }).eq("id", videoContiId);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, sections, durationSeconds, estimatedBpm: null, note });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "BGM 분석에 실패했습니다" }, { status: 500 });
  }
}
