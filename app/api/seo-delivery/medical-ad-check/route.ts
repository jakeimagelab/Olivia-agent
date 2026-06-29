import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DANGER_WORDS = ["완치","보장","1위","최고","100%","부작용없음","전후비교"];
const CAUTION_WORDS = [
  "유일","확실한","통증완전해결","반드시","무조건","완벽","탁월한효과",
  "놀라운","기적","혁신적","최선","최우수","가장좋은","최다",
];

function check(text: string): {
  riskLevel: "safe" | "caution" | "danger";
  riskyPhrases: string[];
  reasons: string[];
  revisedSafeText: string;
} {
  const clean = text.replace(/\s/g, "");
  const dangerFound = DANGER_WORDS.filter((w) => clean.includes(w));
  const cautionFound = CAUTION_WORDS.filter((w) => clean.includes(w));
  const allFound = [...new Set([...dangerFound, ...cautionFound])];

  if (allFound.length === 0) {
    return { riskLevel: "safe", riskyPhrases: [], reasons: [], revisedSafeText: text };
  }

  const reasons = allFound.map((w) =>
    DANGER_WORDS.includes(w)
      ? `"${w}" — 의료광고법 제56조 위반 위험 (효과 단정·보장 표현)`
      : `"${w}" — 과장 표현으로 주의 필요`
  );

  // 간단한 수정: 위험 표현을 안전 표현으로 교체
  let revised = text;
  const replacements: Record<string, string> = {
    "통증완전해결": "통증 완화를 위한",
    "완치": "진료",
    "보장": "지원",
    "최고": "전문",
    "1위": "전문",
    "부작용없음": "안전한 진료 환경",
    "탁월한효과": "진료 과정",
    "놀라운": "전문적인",
    "기적": "진료",
    "혁신적": "전문",
  };
  for (const [risky, safe] of Object.entries(replacements)) {
    revised = revised.replace(new RegExp(risky, "g"), safe);
  }

  return {
    riskLevel: dangerFound.length > 0 ? "danger" : "caution",
    riskyPhrases: allFound,
    reasons,
    revisedSafeText: revised,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { texts } = body as { texts: { id: string; field: string; text: string }[] };

  if (!texts?.length) {
    return NextResponse.json({ ok: false, error: "texts 배열 필수" }, { status: 400 });
  }

  const results = texts.map(({ id, field, text }) => ({
    id,
    field,
    originalText: text,
    ...check(text),
  }));

  const dangerCount = results.filter((r) => r.riskLevel === "danger").length;
  const cautionCount = results.filter((r) => r.riskLevel === "caution").length;

  return NextResponse.json({
    ok: true,
    results,
    summary: { total: results.length, safe: results.length - dangerCount - cautionCount, caution: cautionCount, danger: dangerCount },
  });
}
