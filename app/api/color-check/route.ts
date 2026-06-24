import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 포토클리닉 컬러 DNA v1 타겟값
const DNA = {
  skin: {
    highlight: { r: 240, g: 235, b: 204, label: "피부 하이라이트" },
    mid:       { r: 196, g: 179, b: 126, label: "피부 미드톤" },
    shadow:    { r: 168, g: 165, b: 90,  label: "피부 쉐도우" },
  },
  cameraRaw: {
    temperature: 5900, tint: 3, exposure: 0.2,
    highlights: -30, shadows: 20, whites: 8,
    blacks: 12, clarity: 8, vibrance: -5,
  },
  hsl: {
    reds:    { h: 0,  s: -8,  l: 5 },
    oranges: { h: 3,  s: -6,  l: 4 },
    yellows: { h: 0,  s: -10, l: 0 },
  },
};

function toHex(r: number, g: number, b: number) {
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`.toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageMime = "image/jpeg" } = await req.json();
    if (!imageBase64) return NextResponse.json({ ok: false, error: "이미지 없음" }, { status: 400 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: imageMime as any, data: imageBase64 } },
          { type: "text", text: `전문 사진 리터처로서 이 병원 인물 사진의 피부톤 RGB를 분석하세요.

반드시 JSON만 응답 (다른 텍스트 없이):
{
  "detected": true,
  "skinHighlight": {"r": 숫자, "g": 숫자, "b": 숫자},
  "skinMid":       {"r": 숫자, "g": 숫자, "b": 숫자},
  "skinShadow":    {"r": 숫자, "g": 숫자, "b": 숫자},
  "whiteRef":      {"r": 숫자, "g": 숫자, "b": 숫자, "found": true/false},
  "colorTemp":     "쿨" | "뉴트럴" | "약간웜" | "웜",
  "saturation":    "낮음" | "적당" | "높음",
  "skinNote":      "한 문장 색감 특징",
  "confidence":    0~100
}

인물/피부가 없으면: {"detected": false}` },
        ],
      }],
    });

    const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ ok: false, error: "분석 실패" }, { status: 500 });

    const v = JSON.parse(m[0]);
    if (!v.detected) return NextResponse.json({ ok: true, detected: false });

    const diff = (a: {r:number;g:number;b:number}, b: {r:number;g:number;b:number}) => ({
      r: b.r - a.r, g: b.g - a.g, b: b.b - a.b,
      dist: Math.round(Math.sqrt((b.r-a.r)**2 + (b.g-a.g)**2 + (b.b-a.b)**2)),
    });

    const hlDiff  = diff(v.skinHighlight, DNA.skin.highlight);
    const midDiff = diff(v.skinMid,       DNA.skin.mid);
    const shDiff  = diff(v.skinShadow,    DNA.skin.shadow);
    const avgDist = (hlDiff.dist + midDiff.dist + shDiff.dist) / 3;
    const matchScore = Math.max(0, Math.round(100 - avgDist * 1.2));

    // 색온도 보정 추정 (흰 기준 있으면)
    let tempAdjust = 0;
    if (v.whiteRef?.found) {
      if (v.whiteRef.b > v.whiteRef.r + 10) tempAdjust = Math.round((v.whiteRef.b - v.whiteRef.r) * 8);
      if (v.whiteRef.r > v.whiteRef.b + 10) tempAdjust = -Math.round((v.whiteRef.r - v.whiteRef.b) * 8);
    }
    const midBright = (v.skinMid.r + v.skinMid.g + v.skinMid.b) / 3;
    const tgtBright = (DNA.skin.mid.r + DNA.skin.mid.g + DNA.skin.mid.b) / 3;
    const expAdj = parseFloat(((tgtBright - midBright) / 100).toFixed(2));
    const vibAdj = v.saturation === "높음" ? -8 : v.saturation === "낮음" ? 3 : 0;

    return NextResponse.json({
      ok: true, detected: true, matchScore,
      current: {
        highlight: { ...v.skinHighlight, hex: toHex(v.skinHighlight.r, v.skinHighlight.g, v.skinHighlight.b) },
        mid:       { ...v.skinMid,       hex: toHex(v.skinMid.r,       v.skinMid.g,       v.skinMid.b) },
        shadow:    { ...v.skinShadow,    hex: toHex(v.skinShadow.r,    v.skinShadow.g,    v.skinShadow.b) },
      },
      target: {
        highlight: { ...DNA.skin.highlight, hex: toHex(DNA.skin.highlight.r, DNA.skin.highlight.g, DNA.skin.highlight.b) },
        mid:       { ...DNA.skin.mid,       hex: toHex(DNA.skin.mid.r,       DNA.skin.mid.g,       DNA.skin.mid.b) },
        shadow:    { ...DNA.skin.shadow,    hex: toHex(DNA.skin.shadow.r,    DNA.skin.shadow.g,    DNA.skin.shadow.b) },
      },
      diff: { highlight: hlDiff, mid: midDiff, shadow: shDiff },
      colorTemp: v.colorTemp, saturation: v.saturation,
      skinNote: v.skinNote, confidence: v.confidence,
      adjustments: {
        temperature: tempAdjust,
        exposure: expAdj,
        vibrance: DNA.cameraRaw.vibrance + vibAdj,
        hsl: DNA.hsl,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
