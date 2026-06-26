import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { thumbnails, originalName } = await req.json() as {
    thumbnails: string[];
    originalName: string;
  };

  if (!thumbnails || thumbnails.length === 0) {
    return NextResponse.json({ ok: false, error: "이미지가 없습니다" });
  }

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `이 사진들은 의료/병원 촬영의 "${originalName}" 씬 대표 사진들입니다.

사진들을 분석하여 씬 폴더명을 한국어로 추천해주세요.

추천 형식: 장소_내용 (예: 로비_하모니컷, 원장_프로필, 상담실_원장상담, 초음파_검사장면, 병동_회진)

공간: 로비, 상담실, 진료실, 수술실, 검사실, 외관, 병동, 촬영실
인물: 원장, 직원, 환자, 단체
행동: 상담, 진료, 회진, 검사, 설명
장비: 초음파, X-ray, 레이저, 내시경
목적: 프로필, 하모니컷, 인테리어, 장비컷, 진료연출

반드시 JSON으로만 응답하세요: {"name": "장소_내용", "confidence": 0.85, "reason": "판단 근거"}`,
    },
    ...thumbnails.slice(0, 4).map((img: string) => {
      // Strip data URL prefix to get raw base64
      const base64 = img.replace(/^data:image\/\w+;base64,/, "");
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: base64,
        },
      };
    }),
  ];

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content }],
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    return NextResponse.json({ ok: true, name: parsed.name ?? "", confidence: parsed.confidence ?? 0.5, reason: parsed.reason ?? "" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "AI 분석 실패" });
  }
}
