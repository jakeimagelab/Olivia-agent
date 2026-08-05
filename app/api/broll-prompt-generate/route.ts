import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FIXED_STYLE_SUFFIX =
  "flat illustration, sky blue and charcoal color palette, minimal medical diagram style, no text, no watermark, " +
  "anatomically simplified, educational tone, non-graphic, no real identifiable people";

const SYSTEM_PROMPT = `너는 유튜브 대본 구절을 영문 이미지 생성 프롬프트로 변환하는 도구야.
전체 대본 맥락은 어떤 소재/톤의 영상인지 참고만 하고, 실제 이미지화 대상은 "이미지화할 구간"이야.
사실적인 환자 사진처럼 보이는 인물 묘사는 피하고 일러스트/다이어그램 톤을 유지해.
항상 다음 스타일을 프롬프트 끝에 그대로 포함해: '${FIXED_STYLE_SUFFIX}'.
결과는 영문 이미지 생성 프롬프트 텍스트 하나만 출력하고, 다른 설명이나 따옴표, 사족은 붙이지 마.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { fullScript?: string; targetSnippet?: string } | null;
  const targetSnippet = body?.targetSnippet?.trim();
  const fullScript = body?.fullScript?.trim() ?? "";
  if (!targetSnippet) return NextResponse.json({ ok: false, error: "이미지화할 구간을 입력해주세요." });

  const userMessage = fullScript
    ? `전체 대본 맥락: ${fullScript}\n\n이미지화할 구간: ${targetSnippet}`
    : `이미지화할 구간: ${targetSnippet}`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const prompt = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    if (!prompt) return NextResponse.json({ ok: false, error: "프롬프트 생성 결과가 비어있습니다." });
    return NextResponse.json({ ok: true, prompt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "프롬프트 생성 실패" });
  }
}
