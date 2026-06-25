import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function calcPsColorBalance(current: { r: number; g: number; b: number }, target: { r: number; g: number; b: number }) {
  const dr = current.r - target.r;
  const dg = current.g - target.g;
  const db = current.b - target.b;
  const cyanRed    = Math.round(Math.max(-20, Math.min(20, -dr * 0.6)));
  const magGreen   = Math.round(Math.max(-20, Math.min(20, -dg * 0.4)));
  const yellowBlue = Math.round(Math.max(-20, Math.min(20, -db * 0.6)));
  return { cyanRed, magGreen, yellowBlue };
}

function calcCameraRawTemp(refWhite: any, tgtWhite: any): number {
  if (!refWhite?.found || !tgtWhite?.found) return 0;
  const refBias = refWhite.b - refWhite.r;
  const tgtBias = tgtWhite.b - tgtWhite.r;
  const diff = tgtBias - refBias;
  return Math.round(Math.max(-200, Math.min(200, -diff * 12)));
}

async function analyzeImage(base64: string, mime: string, role: "reference" | "target") {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime as any, data: base64 } },
        {
          type: "text",
          text: `전문 사진 리터처로서 이 인물 사진(${role === "reference" ? "기준 사진" : "동기화 대상 사진"})의 피부톤 RGB를 정밀 분석하세요.

JSON만 응답 (다른 텍스트 없이):
{
  "detected": true,
  "skinHighlight": {"r": 숫자, "g": 숫자, "b": 숫자},
  "skinMid":       {"r": 숫자, "g": 숫자, "b": 숫자},
  "skinShadow":    {"r": 숫자, "g": 숫자, "b": 숫자},
  "whiteRef":      {"r": 숫자, "g": 숫자, "b": 숫자, "found": true/false},
  "colorTemp":     "쿨" | "뉴트럴" | "약간웜" | "웜",
  "saturation":    "낮음" | "적당" | "높음",
  "skinNote":      "색감 한 줄 요약",
  "confidence":    0~100
}

인물/피부 없으면: {"detected": false}`
        },
      ],
    }],
  });
  const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`${role} 분석 실패`);
  return JSON.parse(m[0]);
}

export async function POST(req: NextRequest) {
  try {
    const { referenceBase64, referenceMime = "image/jpeg", targetBase64, targetMime = "image/jpeg" } = await req.json();
    if (!referenceBase64 || !targetBase64) {
      return NextResponse.json({ ok: false, error: "두 장의 이미지가 필요합니다" }, { status: 400 });
    }

    // 두 이미지 병렬 분석
    const [ref, tgt] = await Promise.all([
      analyzeImage(referenceBase64, referenceMime, "reference"),
      analyzeImage(targetBase64, targetMime, "target"),
    ]);

    if (!ref.detected) return NextResponse.json({ ok: false, error: "기준 사진에서 피부를 찾지 못했습니다" }, { status: 422 });
    if (!tgt.detected) return NextResponse.json({ ok: false, error: "동기화 사진에서 피부를 찾지 못했습니다" }, { status: 422 });

    // 미드톤 기준 차이
    const hlDiff = {
      r: ref.skinHighlight.r - tgt.skinHighlight.r,
      g: ref.skinHighlight.g - tgt.skinHighlight.g,
      b: ref.skinHighlight.b - tgt.skinHighlight.b,
      dist: Math.round(Math.sqrt(
        (ref.skinHighlight.r - tgt.skinHighlight.r) ** 2 +
        (ref.skinHighlight.g - tgt.skinHighlight.g) ** 2 +
        (ref.skinHighlight.b - tgt.skinHighlight.b) ** 2
      )),
    };
    const midDiff = {
      r: ref.skinMid.r - tgt.skinMid.r,
      g: ref.skinMid.g - tgt.skinMid.g,
      b: ref.skinMid.b - tgt.skinMid.b,
      dist: Math.round(Math.sqrt(
        (ref.skinMid.r - tgt.skinMid.r) ** 2 +
        (ref.skinMid.g - tgt.skinMid.g) ** 2 +
        (ref.skinMid.b - tgt.skinMid.b) ** 2
      )),
    };
    const shDiff = {
      r: ref.skinShadow.r - tgt.skinShadow.r,
      g: ref.skinShadow.g - tgt.skinShadow.g,
      b: ref.skinShadow.b - tgt.skinShadow.b,
      dist: Math.round(Math.sqrt(
        (ref.skinShadow.r - tgt.skinShadow.r) ** 2 +
        (ref.skinShadow.g - tgt.skinShadow.g) ** 2 +
        (ref.skinShadow.b - tgt.skinShadow.b) ** 2
      )),
    };

    const avgDist = (hlDiff.dist + midDiff.dist + shDiff.dist) / 3;
    const syncScore = Math.max(0, Math.round(100 - avgDist * 1.2));

    // Photoshop 색상균형 — 미드톤 기준 (대상 → 기준으로 맞춤)
    const psBalance = calcPsColorBalance(tgt.skinMid, ref.skinMid);

    // 평균 전체 보정값
    const avgRef = {
      r: Math.round((ref.skinHighlight.r + ref.skinMid.r + ref.skinShadow.r) / 3),
      g: Math.round((ref.skinHighlight.g + ref.skinMid.g + ref.skinShadow.g) / 3),
      b: Math.round((ref.skinHighlight.b + ref.skinMid.b + ref.skinShadow.b) / 3),
    };
    const avgTgt = {
      r: Math.round((tgt.skinHighlight.r + tgt.skinMid.r + tgt.skinShadow.r) / 3),
      g: Math.round((tgt.skinHighlight.g + tgt.skinMid.g + tgt.skinShadow.g) / 3),
      b: Math.round((tgt.skinHighlight.b + tgt.skinMid.g + tgt.skinShadow.b) / 3),
    };
    const psOverall = calcPsColorBalance(avgTgt, avgRef);

    // 색온도 차이
    const tempAdj = calcCameraRawTemp(ref.whiteRef, tgt.whiteRef);

    // 노출 차이
    const refBright = (ref.skinMid.r + ref.skinMid.g + ref.skinMid.b) / 3;
    const tgtBright = (tgt.skinMid.r + tgt.skinMid.g + tgt.skinMid.b) / 3;
    const expAdj = parseFloat(((refBright - tgtBright) / 100).toFixed(2));

    // 채도 차이
    const satMap: Record<string, number> = { 낮음: -1, 적당: 0, 높음: 1 };
    const satDiff = (satMap[ref.saturation] ?? 0) - (satMap[tgt.saturation] ?? 0);
    const vibranceAdj = satDiff * 4;

    // 자연어 가이드 생성
    const guide: string[] = [];
    if (Math.abs(tempAdj) >= 50) {
      guide.push(`색온도 ${tempAdj > 0 ? `+${tempAdj}` : tempAdj} (${tempAdj > 0 ? "기준보다 쿨, 웜하게" : "기준보다 웜, 쿨하게"})`);
    }
    if (Math.abs(expAdj) >= 0.05) {
      guide.push(`노출 ${expAdj > 0 ? `+${expAdj}` : expAdj} (${expAdj > 0 ? "기준보다 어두움" : "기준보다 밝음"})`);
    }
    if (Math.abs(psOverall.cyanRed) >= 2) {
      guide.push(`Photoshop 색상균형 녹청↔빨강 ${psOverall.cyanRed > 0 ? `+${psOverall.cyanRed}` : psOverall.cyanRed}`);
    }
    if (Math.abs(psOverall.yellowBlue) >= 2) {
      guide.push(`Photoshop 색상균형 노랑↔파랑 ${psOverall.yellowBlue > 0 ? `+${psOverall.yellowBlue}` : psOverall.yellowBlue} (${psOverall.yellowBlue < 0 ? "기준보다 쿨톤" : "기준보다 웜톤"})`);
    }
    if (Math.abs(psOverall.magGreen) >= 2) {
      guide.push(`Photoshop 색상균형 마젠타↔녹색 ${psOverall.magGreen > 0 ? `+${psOverall.magGreen}` : psOverall.magGreen}`);
    }

    return NextResponse.json({
      ok: true,
      syncScore,
      reference: {
        highlight: { ...ref.skinHighlight, hex: toHex(ref.skinHighlight.r, ref.skinHighlight.g, ref.skinHighlight.b) },
        mid:       { ...ref.skinMid,       hex: toHex(ref.skinMid.r, ref.skinMid.g, ref.skinMid.b) },
        shadow:    { ...ref.skinShadow,    hex: toHex(ref.skinShadow.r, ref.skinShadow.g, ref.skinShadow.b) },
        colorTemp: ref.colorTemp, saturation: ref.saturation, skinNote: ref.skinNote, confidence: ref.confidence,
      },
      target: {
        highlight: { ...tgt.skinHighlight, hex: toHex(tgt.skinHighlight.r, tgt.skinHighlight.g, tgt.skinHighlight.b) },
        mid:       { ...tgt.skinMid,       hex: toHex(tgt.skinMid.r, tgt.skinMid.g, tgt.skinMid.b) },
        shadow:    { ...tgt.skinShadow,    hex: toHex(tgt.skinShadow.r, tgt.skinShadow.g, tgt.skinShadow.b) },
        colorTemp: tgt.colorTemp, saturation: tgt.saturation, skinNote: tgt.skinNote, confidence: tgt.confidence,
      },
      diff: { highlight: hlDiff, mid: midDiff, shadow: shDiff },
      adjustments: { temperature: tempAdj, exposure: expAdj, vibrance: vibranceAdj },
      photoshop: { midtone: psBalance, overall: psOverall, guide, hasAdjustment: guide.length > 0 },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
