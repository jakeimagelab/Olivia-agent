import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Cut {
  id: string;
  order: number;
  timecodeStart: string;
  timecodeEnd: string;
  visualNote: string;
  subtitleCopy: string;
  narrationCopy: string;
}

interface Scene {
  id: string;
  order: number;
  title: string;
  bgmSectionIndex: number;
  startSec: number;
  endSec: number;
  cuts: Cut[];
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "API 키 없음" }, { status: 500 });

    const db = getSupabaseAdmin();
    const { data: row, error: fetchErr } = await db.from("video_conti").select("*").eq("id", id).single();
    if (fetchErr || !row) return NextResponse.json({ ok: false, error: "콘티를 찾을 수 없습니다" }, { status: 404 });

    const { brand_analysis: ba, bgm_sections: bgmSections } = row;

    const brandFilmLines = ba?.brandFilmLines ?? [];
    const photoConti = ba?.photoConti ?? [];
    const keywordGroups = ba?.keywordGroups ?? [];
    const shootingDirection = ba?.shootingDirection ?? "";
    const oneLiner = ba?.oneLiner ?? "";

    const sectionsStr = Array.isArray(bgmSections) && bgmSections.length > 0
      ? bgmSections.map((s: any) => `구간 ${s.index + 1}: ${s.startSec}s~${s.endSec}s, 에너지=${s.energyLevel}, 테마="${s.suggestedTheme ?? ""}", 악기="${s.instrumentation ?? ""}"`).join("\n")
      : "BGM 구간 정보 없음 (3개 기본 구간으로 생성)";

    const numSections = Array.isArray(bgmSections) && bgmSections.length > 0 ? bgmSections.length : 3;

    const prompt = `당신은 브랜드필름 콘티 전문 감독입니다. 아래 브랜드 분석과 BGM 구간 정보를 바탕으로 영상 콘티 씬 목록을 생성해주세요.

브랜드 한줄요약: ${oneLiner}
촬영 방향: ${shootingDirection}

브랜드필름 자막 라인 (5개, 영상 전반에 자연스럽게 배분):
${brandFilmLines.map((l: any, i: number) => `${i + 1}. [${l.usage}] "${l.line}"`).join("\n")}

포토콘티 장면 제안:
${photoConti.slice(0, 6).map((p: any, i: number) => `${i + 1}. ${p.scene}: ${p.shots}`).join("\n")}

키워드 그룹:
${keywordGroups.map((g: any) => `${g.category}: ${g.keywords?.join(", ")}`).join("\n")}

BGM 구간 정보 (총 ${numSections}개 구간):
${sectionsStr}

위 정보를 바탕으로 BGM 구간 수(${numSections}개)와 동일한 수의 씬을 생성하세요.
각 씬은 2~4개의 컷으로 구성되며, brandFilmLines 5개를 씬 전체에 걸쳐 자연스럽게 배분하세요.
타임코드는 "MM:SS" 형식으로 작성하세요.

JSON 배열로만 응답하세요 (다른 텍스트 없이):
[
  {
    "id": "scene-1",
    "order": 1,
    "title": "씬 제목 (BGM 테마 기반)",
    "bgmSectionIndex": 0,
    "startSec": 0,
    "endSec": 30,
    "cuts": [
      {
        "id": "cut-1-1",
        "order": 1,
        "timecodeStart": "00:00",
        "timecodeEnd": "00:08",
        "visualNote": "촬영/비주얼 설명 (카메라 각도, 공간, 피사체 포함)",
        "subtitleCopy": "화면에 표시될 자막 (brandFilmLines에서 가져오거나 빈 문자열)",
        "narrationCopy": "나레이션/보이스오버 내용 (없으면 빈 문자열)"
      }
    ]
  }
]`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await res.json();
    if (aiData.error) throw new Error(aiData.error.message ?? "AI 오류");

    const text: string = aiData.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("씬 데이터를 파싱할 수 없습니다");

    const scenes: Scene[] = JSON.parse(match[0]);

    // Fill in bgm section data if available
    if (Array.isArray(bgmSections)) {
      scenes.forEach((scene, i) => {
        const sec = bgmSections[i];
        if (sec) {
          scene.startSec = sec.startSec ?? scene.startSec;
          scene.endSec = sec.endSec ?? scene.endSec;
          scene.bgmSectionIndex = sec.index ?? i;
        }
      });
    }

    const { error: updateErr } = await db.from("video_conti").update({
      scenes,
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, scenes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
