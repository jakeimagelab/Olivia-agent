import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const { text, contentType } = await req.json();
  if (!text?.trim()) return NextResponse.json({ ok: false, error: "검토할 텍스트를 입력해주세요." }, { status: 400 });

  const systemPrompt = `당신은 한국 의료광고법 전문가입니다.
의료법 제56조 및 의료광고 심의 기준을 기반으로 텍스트를 검토합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "overall_risk": "안전|주의|위험",
  "issues": [
    {
      "original": "위험 표현 원문",
      "risk_type": "효과보장|과장표현|비교우위|전후사진|후기체험담|가격이벤트|전문성과장|환자오인",
      "reason": "위험 사유 설명",
      "suggestion": "수정 제안 문구",
      "safe_alternative": "안전한 대체 문구",
      "level": "낮음|주의|위험"
    }
  ],
  "safe_summary": "전체 안전도 요약 1-2문장",
  "passed_checks": ["통과한 항목 1", "항목 2"]
}

검토 항목:
- 효과 보장 표현: "완전히 사라집니다", "100% 효과" 등
- 과장 표현: "최고", "최초", "유일", "완벽한" 등
- 비교 우위: 타 병원과의 직접 비교
- 전후사진 주의: 비교 전후 사진 설명
- 후기/체험담: "환자 후기에 따르면" 등
- 가격/이벤트 표현: 지나친 할인 강조
- 전문성 과장: 학위·경력 과장
- 환자 오인: 일반인이 의사로 오인할 표현`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `콘텐츠 유형: ${contentType || "기타"}\n\n검토 대상 텍스트:\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return NextResponse.json({ ok: false, error: "AI 응답 없음" }, { status: 500 });

  try {
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }
}
