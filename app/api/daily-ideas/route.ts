import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET — 아이디어 목록 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "14", 10);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("daily_ideas")
      .select("*")
      .order("date", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ideas: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST — 수동으로 오늘 아이디어 생성 (어드민 전용)
export async function POST(req: NextRequest) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const dateKey = today.toISOString().slice(0, 10);
  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][today.getDay()];

  const prompt = `오늘은 ${dateStr} (${dayOfWeek}요일)입니다.

당신은 한국 병원 브랜딩 전문 마케팅 컨설턴트입니다.
포토클리닉(제이크이미지연구소)은 병원·의원 전문 사진 촬영 스튜디오입니다.
대표는 정연호님으로, 병원 브랜딩 사진 촬영, 콘텐츠 제작, 홈페이지 제작을 합니다.

오늘 대표님이 바로 실행할 수 있는 마케팅 & 고객 관리 아이디어를 만들어주세요.
답변은 반드시 아래 JSON 형식으로만 반환하세요 (다른 텍스트 없이):

{
  "marketing_idea": {
    "title": "오늘의 마케팅 아이디어 제목 (20자 이내)",
    "body": "구체적인 실행 방법 (150자 이내, 왜 지금 해야 하는지 포함)",
    "action": "지금 당장 할 수 있는 1가지 실행 항목"
  },
  "content_ideas": [
    {
      "platform": "인스타그램",
      "title": "포스팅 주제 제목",
      "caption_hook": "첫 문장 훅 (사람들이 멈추게 하는 문구)",
      "body": "포스팅 내용 방향 (100자 이내)"
    },
    {
      "platform": "블로그/네이버",
      "title": "포스팅 주제 제목",
      "caption_hook": "제목 훅",
      "body": "포스팅 내용 방향 (100자 이내)"
    }
  ],
  "customer_tip": {
    "title": "고객 관리 팁 제목",
    "body": "오늘 연락할 고객 유형 또는 관리 방법 (100자 이내)",
    "script": "실제로 사용할 수 있는 카카오톡/문자 예시 문구"
  },
  "mission": {
    "title": "오늘의 미션 (한 줄)",
    "why": "이 미션을 오늘 해야 하는 이유",
    "estimated_time": "예상 소요시간 (예: 30분)"
  },
  "trend_keywords": ["트렌드키워드1", "트렌드키워드2", "트렌드키워드3"]
}

아이디어 작성 기준:
- 병원 사진 스튜디오에 특화된 아이디어 (일반적인 마케팅 팁 금지)
- 오늘 바로 실행 가능한 수준의 구체성
- 요일 특성 반영 (${dayOfWeek}요일임을 고려)
- 계절/시기 반영 (${dateStr})
- 병원 개원 시즌, 의사 사진 리뉴얼 니즈, SNS 콘텐츠 트렌드 등 반영`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");
    const ideas = JSON.parse(jsonMatch[0]);

    // 오늘 날짜로 upsert
    const supabase = getSupabaseAdmin();
    const { error: dbErr } = await supabase.from("daily_ideas").upsert({
      date: dateKey,
      marketing_idea: ideas.marketing_idea,
      content_ideas: ideas.content_ideas,
      customer_tip: ideas.customer_tip,
      mission: ideas.mission,
      trend_keywords: ideas.trend_keywords,
    }, { onConflict: "date" });

    if (dbErr) return NextResponse.json({ ok: false, error: "DB 저장 실패: " + dbErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, ideas, date: dateKey });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
