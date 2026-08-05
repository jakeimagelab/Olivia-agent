import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type BrollStylePreset = "PHOTO" | "MEDICAL_ILLUSTRATION" | "INFOGRAPHIC" | "DIAGRAM" | "CINEMATIC_BROLL" | "STYLIZED_ILLUSTRATION";

const UNIVERSAL_GUARDRAILS = "no text, no watermark, non-graphic, no real identifiable people";

// 자료 유형별 스타일 프리셋 — 유튜브 편집 콘티의 "자료/화면" 스타일 선택(VISUAL_STYLE_TO_PROMPT_PRESET,
// lib/youtube-editing/constants.ts)과 키가 1:1로 대응된다. 기본값은 PHOTO(기존 photorealistic 고정
// 동작과 동일)라 이 필드를 안 보내는 기존 호출부는 그대로 동작한다.
const BROLL_STYLE_PRESETS: Record<BrollStylePreset, string> = {
  PHOTO: "realistic editorial photography, natural clinical lighting, high detail",
  MEDICAL_ILLUSTRATION: "clean educational medical illustration, anatomically simplified",
  INFOGRAPHIC: "minimal flat medical infographic, clear visual hierarchy",
  DIAGRAM: "medical mechanism diagram, interconnected nodes and arrows",
  CINEMATIC_BROLL: "cinematic documentary b-roll, natural environment and lighting",
  STYLIZED_ILLUSTRATION: "polished editorial illustration, not fully photorealistic",
};

const STYLE_GUIDANCE: Record<BrollStylePreset, string> = {
  PHOTO: "결과 이미지는 일러스트가 아니라 실사(포토리얼리스틱) 사진처럼 보여야 해 — 카메라로 촬영한 듯한 사실적인 질감, 조명, 디테일을 구체적으로 묘사해.",
  CINEMATIC_BROLL: "결과 이미지는 실제 촬영한 다큐멘터리풍 영상 B-roll 한 프레임처럼 보여야 해 — 자연스러운 환경, 조명, 카메라 질감을 구체적으로 묘사해.",
  MEDICAL_ILLUSTRATION: "결과 이미지는 실사가 아니라 깔끔한 의료 교육용 일러스트여야 해 — 해부학적으로 단순화된 형태로 묘사해.",
  INFOGRAPHIC: "결과 이미지는 실사가 아니라 미니멀한 플랫 인포그래픽이어야 해 — 명확한 시각적 위계를 갖도록 묘사해.",
  DIAGRAM: "결과 이미지는 실사가 아니라 의료 매커니즘 다이어그램이어야 해 — 노드와 화살표로 연결된 구조를 묘사해.",
  STYLIZED_ILLUSTRATION: "결과 이미지는 완전한 실사가 아니라 세련된 에디토리얼 일러스트여야 해.",
};

function buildStyleSuffix(style: BrollStylePreset): string {
  return `${BROLL_STYLE_PRESETS[style]}, ${UNIVERSAL_GUARDRAILS}`;
}

function buildSystemPrompt(style: BrollStylePreset): string {
  const suffix = buildStyleSuffix(style);
  return `너는 유튜브 대본 구절을 영문 이미지 생성 프롬프트로 변환하는 도구야.
전체 대본 맥락은 어떤 소재/톤의 영상인지 참고만 하고, 실제 이미지화 대상은 "이미지화할 구간"이야.
${STYLE_GUIDANCE[style]} 다만 특정 실존 인물로 보일 만한 묘사는 넣지 마(가이드라인 문구로 대체됨).
항상 다음 스타일을 프롬프트 끝에 그대로 포함해: '${suffix}'.
결과는 영문 이미지 생성 프롬프트 텍스트 하나만 출력하고, 다른 설명이나 따옴표, 사족은 붙이지 마.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { fullScript?: string; targetSnippet?: string; style?: string } | null;
  const targetSnippet = body?.targetSnippet?.trim();
  const fullScript = body?.fullScript?.trim() ?? "";
  if (!targetSnippet) return NextResponse.json({ ok: false, error: "이미지화할 구간을 입력해주세요." });
  const style: BrollStylePreset = body?.style && body.style in BROLL_STYLE_PRESETS ? (body.style as BrollStylePreset) : "PHOTO";

  const userMessage = fullScript
    ? `전체 대본 맥락: ${fullScript}\n\n이미지화할 구간: ${targetSnippet}`
    : `이미지화할 구간: ${targetSnippet}`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: buildSystemPrompt(style),
      messages: [{ role: "user", content: userMessage }],
    });
    const prompt = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    if (!prompt) return NextResponse.json({ ok: false, error: "프롬프트 생성 결과가 비어있습니다." });
    return NextResponse.json({ ok: true, prompt, style });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "프롬프트 생성 실패" });
  }
}
