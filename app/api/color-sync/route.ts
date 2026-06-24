import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function calcPsColorBalance(cur: { r: number; g: number; b: number }, tgt: { r: number; g: number; b: number }) {
  return {
    cyanRed:    Math.round(Math.max(-20, Math.min(20, -(cur.r - tgt.r) * 0.6))),
    magGreen:   Math.round(Math.max(-20, Math.min(20, -(cur.g - tgt.g) * 0.4))),
    yellowBlue: Math.round(Math.max(-20, Math.min(20, -(cur.b - tgt.b) * 0.6))),
  };
}

function zoneDist(a: any, b: any) {
  return Math.round(Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2));
}

async function analyzeImage(base64: string, mime: string, role: "reference" | "target") {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime as any, data: base64 } },
        {
          type: "text",
          text: `전문 사진 리터처로서 이 인물 사진(${role === "reference" ? "기준 사진" : "동기화 대상 사진"})을 3가지 영역으로 구분해 RGB를 정밀 분석하세요.

JSON만 응답 (다른 텍스트 없이):
{
  "detected": true,
  "face": {"r": 숫자, "g": 숫자, "b": 숫자, "note": "피부톤 한 줄 특징", "found": true},
  "gown": {"r": 숫자, "g": 숫자, "b": 숫자, "note": "가운·의복 색감 특징", "found": true},
  "background": {"r": 숫자, "g": 숫자, "b": 숫자, "note": "배경 색감 특징", "found": true},
  "overallNote": "전체 색감 한 줄 요약",
  "confidence": 0~100
}

- face: 얼굴·피부 영역 평균 RGB (미드톤 기준)
- gown: 흰색 가운·의복 영역 평균 RGB
- background: 촬영 배경 영역 평균 RGB
- 해당 영역이 없거나 식별 불가 시 found: false, r/g/b: 0

인물 없으면: {"detected": false}`,
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

    const [ref, tgt] = await Promise.all([
      analyzeImage(referenceBase64, referenceMime, "reference"),
      analyzeImage(targetBase64, targetMime, "target"),
    ]);

    if (!ref.detected) return NextResponse.json({ ok: false, error: "기준 사진에서 인물을 찾지 못했습니다" }, { status: 422 });
    if (!tgt.detected) return NextResponse.json({ ok: false, error: "동기화 사진에서 인물을 찾지 못했습니다" }, { status: 422 });

    // 3존 분석
    const ZONES = [
      { key: "face",       weight: 0.4 },
      { key: "gown",       weight: 0.4 },
      { key: "background", weight: 0.2 },
    ] as const;

    type ZoneKey = "face" | "gown" | "background";
    const zoneResults: Record<ZoneKey, any> = { face: null, gown: null, background: null };
    let totalWeight = 0;
    let weightedScore = 0;

    for (const { key, weight } of ZONES) {
      const r = ref[key];
      const t = tgt[key];
      const bothFound = r?.found && t?.found;
      const dist = bothFound ? zoneDist(r, t) : 0;
      const score = bothFound ? Math.max(0, Math.round(100 - dist * 1.5)) : null;

      if (bothFound) {
        weightedScore += score! * weight;
        totalWeight += weight;
      }

      zoneResults[key] = {
        reference: r?.found ? { r: r.r, g: r.g, b: r.b, hex: toHex(r.r, r.g, r.b), note: r.note } : null,
        target:    t?.found ? { r: t.r, g: t.g, b: t.b, hex: toHex(t.r, t.g, t.b), note: t.note } : null,
        dist: bothFound ? dist : null,
        score,
      };
    }

    const syncScore = totalWeight > 0 ? Math.max(0, Math.round(weightedScore / totalWeight)) : 0;

    // Photoshop 조정 — 얼굴톤 기준
    const fR = ref.face?.found ? ref.face : null;
    const fT = tgt.face?.found ? tgt.face : null;
    const psBalance = (fR && fT) ? calcPsColorBalance(fT, fR) : { cyanRed: 0, magGreen: 0, yellowBlue: 0 };

    // 노출 — 얼굴 밝기 기준
    const expAdj = (fR && fT)
      ? parseFloat((((fR.r + fR.g + fR.b) / 3 - (fT.r + fT.g + fT.b) / 3) / 100).toFixed(2))
      : 0;

    // 색온도 — 배경 중성 기준
    const bgR = ref.background?.found ? ref.background : null;
    const bgT = tgt.background?.found ? tgt.background : null;
    const tempAdj = (bgR && bgT)
      ? Math.round(Math.max(-200, Math.min(200, -((bgT.b - bgT.r) - (bgR.b - bgR.r)) * 12)))
      : 0;

    // 자연어 가이드
    const guide: string[] = [];
    if (Math.abs(tempAdj) >= 50)          guide.push(`색온도 ${tempAdj > 0 ? `+${tempAdj}` : tempAdj}K (${tempAdj > 0 ? "더 웜하게" : "더 쿨하게"})`);
    if (Math.abs(expAdj) >= 0.05)         guide.push(`노출 ${expAdj > 0 ? `+${expAdj}` : expAdj} (${expAdj > 0 ? "더 밝게" : "더 어둡게"})`);
    if (Math.abs(psBalance.cyanRed) >= 2)    guide.push(`녹청↔빨강 ${psBalance.cyanRed > 0 ? `+${psBalance.cyanRed}` : psBalance.cyanRed}`);
    if (Math.abs(psBalance.yellowBlue) >= 2) guide.push(`노랑↔파랑 ${psBalance.yellowBlue > 0 ? `+${psBalance.yellowBlue}` : psBalance.yellowBlue}`);
    if (Math.abs(psBalance.magGreen) >= 2)   guide.push(`마젠타↔녹색 ${psBalance.magGreen > 0 ? `+${psBalance.magGreen}` : psBalance.magGreen}`);

    return NextResponse.json({
      ok: true,
      syncScore,
      zones: zoneResults,
      overallNotes: { reference: ref.overallNote ?? "", target: tgt.overallNote ?? "" },
      adjustments: { temperature: tempAdj, exposure: expAdj },
      photoshop: { balance: psBalance, guide, hasAdjustment: guide.length > 0 },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
