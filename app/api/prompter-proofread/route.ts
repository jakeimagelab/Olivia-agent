import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ ok: false, error: "검토할 대본이 없습니다." });

  const prompt = `다음은 촬영 현장에서 프롬프터(텔레프롬프터)로 소리 내어 읽을 한국어 대본입니다.

이 대본을 검토해서 아래 두 종류의 문제만 찾아주세요:
1. spelling — 맞춤법, 띄어쓰기, 오탈자
2. naturalness — 문법적으로 틀리진 않지만 소리 내어 읽기엔 어색하거나 부자연스러운 표현 (더 자연스러운 구어체로 제안)

"original"에는 대본에 실제로 등장하는 문구를 정확히 그대로 인용하세요 (다르면 적용이 안 됩니다).
문제가 없으면 빈 배열을 반환하고, 너무 사소하거나 취향 차이 수준인 지적은 하지 마세요 (최대 15개).

반드시 아래 JSON 배열 형식으로만 응답하세요 (다른 설명 텍스트 없이):
[{"type": "spelling" 또는 "naturalness", "original": "원문 그대로의 문구", "suggestion": "수정 제안", "reason": "간단한 이유"}]

대본:
"""
${text}
"""`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const issues = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    return NextResponse.json({ ok: true, issues });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "AI 검토 실패" });
  }
}
