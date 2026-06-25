import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 포토클리닉 컬러 DNA v1 — 3장 평균 확정값
const DNA = {
  skin: {
    highlight: { r: 244, g: 224, b: 210, label: "피부 하이라이트 (이마·코)" },
    mid:       { r: 217, g: 186, b: 169, label: "피부 미드톤 (볼·광대)" },
    shadow:    { r: 182, g: 146, b: 130, label: "피부 쉐도우 (턱선·목)" },
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
  return `#${[r,g,b].map(v => v.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
}

function calcPsColorBalance(current: {r:number;g:number;b:number}, target: {r:number;g:number;b:number}) {
  const dr = current.r - target.r;
  const dg = current.g - target.g;
  const db = current.b - target.b;
  // Photoshop Color Balance (중간 영역 기준)
  // 녹청↔빨강: 빨강 많으면 음수(녹청), 빨강 적으면 양수(빨강)
  const cyanRed    = Math.round(Math.max(-15, Math.min(15, -dr * 0.6)));
  // 마젠타↔녹색: 녹색 많으면 음수(마젠타), 녹색 적으면 양수(녹색)
  const magGreen   = Math.round(Math.max(-15, Math.min(15, -dg * 0.4)));
  // 노랑↔파랑: 파랑 많으면 음수(노랑), 파랑 적으면 양수(파랑)
  const yellowBlue = Math.round(Math.max(-15, Math.min(15, -db * 0.6)));
  return { cyanRed, magGreen, yellowBlue };
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

    // Camera Raw 보정
    let tempAdjust = 0;
    if (v.whiteRef?.found) {
      if (v.whiteRef.b > v.whiteRef.r + 10) tempAdjust = Math.round((v.whiteRef.b - v.whiteRef.r) * 8);
      if (v.whiteRef.r > v.whiteRef.b + 10) tempAdjust = -Math.round((v.whiteRef.r - v.whiteRef.b) * 8);
    }
    const midBright = (v.skinMid.r + v.skinMid.g + v.skinMid.b) / 3;
    const tgtBright = (DNA.skin.mid.r + DNA.skin.mid.g + DNA.skin.mid.b) / 3;
    const expAdj = parseFloat(((tgtBright - midBright) / 100).toFixed(2));
    const vibAdj = v.saturation === "높음" ? -8 : v.saturation === "낮음" ? 3 : 0;

    // Photoshop Color Balance (미드톤 기준)
    const psBalance = calcPsColorBalance(v.skinMid, DNA.skin.mid);

    // 하이라이트/쉐도우 미드톤 평균으로 통합 PS 가이드
    const avgCurrent = {
      r: Math.round((v.skinHighlight.r + v.skinMid.r + v.skinShadow.r) / 3),
      g: Math.round((v.skinHighlight.g + v.skinMid.g + v.skinShadow.g) / 3),
      b: Math.round((v.skinHighlight.b + v.skinMid.b + v.skinShadow.b) / 3),
    };
    const avgTarget = {
      r: Math.round((DNA.skin.highlight.r + DNA.skin.mid.r + DNA.skin.shadow.r) / 3),
      g: Math.round((DNA.skin.highlight.g + DNA.skin.mid.g + DNA.skin.shadow.g) / 3),
      b: Math.round((DNA.skin.highlight.b + DNA.skin.mid.b + DNA.skin.shadow.b) / 3),
    };
    const psBalanceAvg = calcPsColorBalance(avgCurrent, avgTarget);

    // 자연어 PS 가이드 생성
    const psGuide: string[] = [];
    if (Math.abs(psBalanceAvg.cyanRed) >= 2) {
      psGuide.push(psBalanceAvg.cyanRed < 0
        ? `녹청↔빨강 ${psBalanceAvg.cyanRed} (빨간기 절제)`
        : `녹청↔빨강 +${psBalanceAvg.cyanRed} (빨간기 보충)`);
    }
    if (Math.abs(psBalanceAvg.magGreen) >= 2) {
      psGuide.push(psBalanceAvg.magGreen < 0
        ? `마젠타↔녹색 ${psBalanceAvg.magGreen} (녹색 절제)`
        : `마젠타↔녹색 +${psBalanceAvg.magGreen} (녹색 보충)`);
    }
    if (Math.abs(psBalanceAvg.yellowBlue) >= 2) {
      psGuide.push(psBalanceAvg.yellowBlue < 0
        ? `노랑↔파랑 ${psBalanceAvg.yellowBlue} (쿨톤 완화, 옐로우)`
        : `노랑↔파랑 +${psBalanceAvg.yellowBlue} (웜톤 완화, 파랑)`);
    }

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
      photoshop: {
        midtone: psBalance,
        overall: psBalanceAvg,
        guide: psGuide,
        hasAdjustment: psGuide.length > 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
