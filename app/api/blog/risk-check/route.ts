import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  let body: { text?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문 파싱 실패" }, { status: 400 });
  }

  const { text, contentType } = body;
  if (!text?.trim()) {
    return NextResponse.json({ ok: false, error: "검토할 텍스트를 입력해주세요." }, { status: 400 });
  }

  const systemPrompt = `당신은 한국 의료광고법 전문가입니다.
의료법 제56조 및 의료광고 심의 기준을 기반으로 블로그 콘텐츠를 검토합니다.
포토클리닉(병원 브랜딩 촬영 스튜디오) 관련 콘텐츠 특성을 고려하여 검토하세요.

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

블로그 콘텐츠 검토 항목:
- 효과 보장 표현: "완전히 사라집니다", "100% 효과", "치료됩니다" 등
- 과장 표현: "최고", "최초", "유일", "완벽한", "압도적" 등
- 비교 우위: 타 병원·스튜디오와의 직접 비교
- 전후사진 주의: 의료 시술 전후 비교 사진 설명 (공간/인테리어 전후는 허용)
- 후기/체험담: 환자 후기를 사실처럼 기술 (촬영 후기는 별도 기준 적용)
- 가격/이벤트 표현: 지나친 할인·이벤트 강조
- 전문성 과장: 의료진 학위·경력 과장
- 환자 오인: 일반인이 의사로 오인할 표현
- 촬영 결과 과장: 사진 촬영 결과가 의료적 효과인 것처럼 오인 유도`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `콘텐츠 유형: ${contentType || "블로그"}\n\n검토 대상 텍스트:\n\n${text}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ ok: false, error: `OpenAI 오류: ${err}` }, { status: 500 });
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "AI 응답 없음" }, { status: 500 });
  }

  try {
    const data = JSON.parse(raw);
    return NextResponse.json({
      ok: true,
      overall_risk: data.overall_risk ?? "주의",
      issues: data.issues ?? [],
      safe_summary: data.safe_summary ?? "",
      passed_checks: data.passed_checks ?? [],
    });
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }
}
