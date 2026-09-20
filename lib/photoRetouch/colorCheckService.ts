import Anthropic from "@anthropic-ai/sdk";

type Rgb = { r: number; g: number; b: number };

export type PhotoColorCheckType = "skin" | "gown";
export type PhotoColorCheckAnalyzer = (input: {
  imageBase64: string;
  imageMime: string;
  checkType: PhotoColorCheckType;
}) => Promise<Record<string, unknown>>;

const DNA = {
  skin: {
    highlight: { r: 244, g: 224, b: 210, label: "피부 하이라이트 (이마·코)" },
    mid: { r: 217, g: 186, b: 169, label: "피부 미드톤 (볼·광대)" },
    shadow: { r: 182, g: 146, b: 130, label: "피부 쉐도우 (턱선·목)" },
  },
  cameraRaw: { vibrance: -5 },
  hsl: {
    reds: { h: 0, s: -8, l: 5 },
    oranges: { h: 3, s: -6, l: 4 },
    yellows: { h: 0, s: -10, l: 0 },
  },
  gown: {
    highlight: { r: 252, g: 249, b: 242, label: "가운 하이라이트 (어깨·팔)" },
    mid: { r: 245, g: 240, b: 228, label: "가운 미드톤 (몸통)" },
    shadow: { r: 225, g: 218, b: 202, label: "가운 쉐도우 (주름·접힘)" },
  },
};

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function asRgb(value: unknown, label: string): Rgb {
  if (!value || typeof value !== "object") throw new Error(`${label} RGB가 없습니다.`);
  const candidate = value as Record<string, unknown>;
  const r = Number(candidate.r);
  const g = Number(candidate.g);
  const b = Number(candidate.b);
  if (![r, g, b].every(Number.isFinite)) throw new Error(`${label} RGB가 올바르지 않습니다.`);
  return { r, g, b };
}

function calcPsColorBalance(current: Rgb, target: Rgb) {
  return {
    cyanRed: Math.round(Math.max(-15, Math.min(15, -(current.r - target.r) * 0.6))),
    magGreen: Math.round(Math.max(-15, Math.min(15, -(current.g - target.g) * 0.4))),
    yellowBlue: Math.round(Math.max(-15, Math.min(15, -(current.b - target.b) * 0.6))),
  };
}

function buildPsGuide(balance: ReturnType<typeof calcPsColorBalance>): string[] {
  const guide: string[] = [];
  if (Math.abs(balance.cyanRed) >= 2) guide.push(balance.cyanRed < 0 ? `녹청↔빨강 ${balance.cyanRed} (빨간기 절제)` : `녹청↔빨강 +${balance.cyanRed} (빨간기 보충)`);
  if (Math.abs(balance.magGreen) >= 2) guide.push(balance.magGreen < 0 ? `마젠타↔녹색 ${balance.magGreen} (녹색 절제)` : `마젠타↔녹색 +${balance.magGreen} (녹색 보충)`);
  if (Math.abs(balance.yellowBlue) >= 2) guide.push(balance.yellowBlue < 0 ? `노랑↔파랑 ${balance.yellowBlue} (쿨톤 완화, 옐로우)` : `노랑↔파랑 +${balance.yellowBlue} (웜톤 완화, 파랑)`);
  return guide;
}

function diffRgb(current: Rgb, target: Rgb) {
  return {
    r: target.r - current.r,
    g: target.g - current.g,
    b: target.b - current.b,
    dist: Math.round(Math.sqrt((target.r - current.r) ** 2 + (target.g - current.g) ** 2 + (target.b - current.b) ** 2)),
  };
}

function extractJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    if (start === -1) throw new Error("AI 응답에서 JSON을 찾지 못했습니다. 다시 시도해주세요.");
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      else if (text[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, index + 1)) as Record<string, unknown>;
          } catch {
            throw new Error("AI 응답 해석에 실패했습니다. 다시 시도해주세요.");
          }
        }
      }
    }
    throw new Error("AI 응답 해석에 실패했습니다. 다시 시도해주세요.");
  }
}

async function requestVision(input: { imageBase64: string; imageMime: string; checkType: PhotoColorCheckType }): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const gown = input.checkType === "gown";
  const response = await client.messages.create({
    model: gown ? "claude-sonnet-5" : "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: input.imageMime as "image/jpeg", data: input.imageBase64 } },
        { type: "text", text: gown
          ? `전문 사진 리터처로서 이 병원 사진 속 의료진의 흰색 가운(白 가운) 색상을 분석하세요.
가운은 순백색이 아니라 살짝 미색(웜톤 화이트 · 아이보리)에 가까워야 합니다. 형광등/창문광 등 조명에 의한 색캐스트가 있는지도 함께 판단하세요.

반드시 JSON만 응답 (다른 텍스트 없이):
{
  "detected": true,
  "gownHighlight": {"r": 숫자, "g": 숫자, "b": 숫자},
  "gownMid":       {"r": 숫자, "g": 숫자, "b": 숫자},
  "gownShadow":    {"r": 숫자, "g": 숫자, "b": 숫자},
  "colorCast":     "쿨(블루/그레이 화이트)" | "뉴트럴 화이트" | "적당한 웜아이보리" | "과도한 웜/노란기",
  "gownNote":      "한 문장 색감 특징",
  "confidence":    0~100
}

흰색 가운(의료복)이 화면에 보이지 않으면: {"detected": false}`
          : `전문 사진 리터처로서 이 병원 인물 사진의 피부톤 RGB를 분석하세요.

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
  const raw = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
  return extractJson(raw);
}

function decorateRgb(value: Rgb) {
  return { ...value, hex: toHex(value) };
}

function buildGownResult(vision: Record<string, unknown>): Record<string, unknown> {
  if (vision.detected !== true) return { ok: true, detected: false, checkType: "gown" };
  const highlight = asRgb(vision.gownHighlight, "가운 하이라이트");
  const mid = asRgb(vision.gownMid, "가운 미드톤");
  const shadow = asRgb(vision.gownShadow, "가운 쉐도우");
  const diffs = { highlight: diffRgb(highlight, DNA.gown.highlight), mid: diffRgb(mid, DNA.gown.mid), shadow: diffRgb(shadow, DNA.gown.shadow) };
  const matchScore = Math.max(0, Math.round(100 - ((diffs.highlight.dist + diffs.mid.dist + diffs.shadow.dist) / 3) * 1.5));
  const average = { r: Math.round((highlight.r + mid.r + shadow.r) / 3), g: Math.round((highlight.g + mid.g + shadow.g) / 3), b: Math.round((highlight.b + mid.b + shadow.b) / 3) };
  const targetAverage = { r: Math.round((DNA.gown.highlight.r + DNA.gown.mid.r + DNA.gown.shadow.r) / 3), g: Math.round((DNA.gown.highlight.g + DNA.gown.mid.g + DNA.gown.shadow.g) / 3), b: Math.round((DNA.gown.highlight.b + DNA.gown.mid.b + DNA.gown.shadow.b) / 3) };
  const overall = calcPsColorBalance(average, targetAverage);
  const guide = buildPsGuide(overall);
  return {
    ok: true, detected: true, checkType: "gown", matchScore,
    current: { highlight: decorateRgb(highlight), mid: decorateRgb(mid), shadow: decorateRgb(shadow) },
    target: { highlight: decorateRgb(DNA.gown.highlight), mid: decorateRgb(DNA.gown.mid), shadow: decorateRgb(DNA.gown.shadow) },
    diff: diffs, colorCast: vision.colorCast, gownNote: vision.gownNote, confidence: vision.confidence,
    photoshop: { midtone: calcPsColorBalance(mid, DNA.gown.mid), overall, guide, hasAdjustment: guide.length > 0 },
  };
}

function buildSkinResult(vision: Record<string, unknown>): Record<string, unknown> {
  if (vision.detected !== true) return { ok: true, detected: false };
  const highlight = asRgb(vision.skinHighlight, "피부 하이라이트");
  const mid = asRgb(vision.skinMid, "피부 미드톤");
  const shadow = asRgb(vision.skinShadow, "피부 쉐도우");
  const diffs = { highlight: diffRgb(highlight, DNA.skin.highlight), mid: diffRgb(mid, DNA.skin.mid), shadow: diffRgb(shadow, DNA.skin.shadow) };
  const matchScore = Math.max(0, Math.round(100 - ((diffs.highlight.dist + diffs.mid.dist + diffs.shadow.dist) / 3) * 1.2));
  const white = vision.whiteRef && typeof vision.whiteRef === "object" ? vision.whiteRef as Record<string, unknown> : null;
  let temperature = 0;
  if (white?.found === true) {
    const whiteRgb = asRgb(white, "화이트 기준");
    if (whiteRgb.b > whiteRgb.r + 10) temperature = Math.round((whiteRgb.b - whiteRgb.r) * 8);
    if (whiteRgb.r > whiteRgb.b + 10) temperature = -Math.round((whiteRgb.r - whiteRgb.b) * 8);
  }
  const exposure = Number((((DNA.skin.mid.r + DNA.skin.mid.g + DNA.skin.mid.b) / 3 - (mid.r + mid.g + mid.b) / 3) / 100).toFixed(2));
  const saturation = typeof vision.saturation === "string" ? vision.saturation : "적당";
  const overall = calcPsColorBalance(
    { r: Math.round((highlight.r + mid.r + shadow.r) / 3), g: Math.round((highlight.g + mid.g + shadow.g) / 3), b: Math.round((highlight.b + mid.b + shadow.b) / 3) },
    { r: Math.round((DNA.skin.highlight.r + DNA.skin.mid.r + DNA.skin.shadow.r) / 3), g: Math.round((DNA.skin.highlight.g + DNA.skin.mid.g + DNA.skin.shadow.g) / 3), b: Math.round((DNA.skin.highlight.b + DNA.skin.mid.b + DNA.skin.shadow.b) / 3) },
  );
  const guide = buildPsGuide(overall);
  return {
    ok: true, detected: true, matchScore,
    current: { highlight: decorateRgb(highlight), mid: decorateRgb(mid), shadow: decorateRgb(shadow) },
    target: { highlight: decorateRgb(DNA.skin.highlight), mid: decorateRgb(DNA.skin.mid), shadow: decorateRgb(DNA.skin.shadow) },
    diff: diffs, colorTemp: vision.colorTemp, saturation, skinNote: vision.skinNote, confidence: vision.confidence,
    adjustments: { temperature, exposure, vibrance: DNA.cameraRaw.vibrance + (saturation === "높음" ? -8 : saturation === "낮음" ? 3 : 0), hsl: DNA.hsl },
    photoshop: { midtone: calcPsColorBalance(mid, DNA.skin.mid), overall, guide, hasAdjustment: guide.length > 0 },
  };
}

export async function analyzePhotoColor(input: {
  imageBase64: string;
  imageMime?: string;
  checkType?: PhotoColorCheckType;
  analyzer?: PhotoColorCheckAnalyzer;
}): Promise<Record<string, unknown>> {
  if (!input.imageBase64) throw new Error("이미지 없음");
  const checkType = input.checkType ?? "skin";
  const vision = await (input.analyzer ?? requestVision)({ imageBase64: input.imageBase64, imageMime: input.imageMime ?? "image/jpeg", checkType });
  return checkType === "gown" ? buildGownResult(vision) : buildSkinResult(vision);
}
