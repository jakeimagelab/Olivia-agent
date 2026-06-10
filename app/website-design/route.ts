import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      hospitalName, doctorName, specialties, phone, address, concept, pages, memo,
      designPrefs
    } = body;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    // 디자인 프리퍼런스 정리
    const layoutLabel: Record<string, string> = {
      simple: "심플·미니멀", modern: "모던·세련", warm: "따뜻·친근", premium: "고급·프리미엄"
    };
    const fontLabel: Record<string, string> = {
      gothic: "고딕체", serif: "명조체", round: "둥근 고딕", mix: "제목 명조+본문 고딕"
    };
    const pageLabel: Record<string, string> = {
      landing: "원페이지 랜딩", multi: "멀티페이지", hybrid: "하이브리드"
    };
    const emphasisLabel: Record<string, string> = {
      doctor: "원장·의료진 중심", service: "시술·진료항목 중심",
      review: "후기·신뢰도 중심", location: "위치·접근성 중심", equipment: "장비·시설 중심"
    };
    const featureLabel: Record<string, string> = {
      kakao: "카카오톡 상담 버튼", naver: "네이버 예약 연동", map: "지도·오시는길",
      popup: "이벤트 팝업", chat: "채팅 상담 위젯", gallery: "포토 갤러리",
      faq: "FAQ 섹션", sns: "SNS 링크", tel: "전화 클릭 버튼", review: "후기·리뷰 섹션"
    };

    const refUrlsText = designPrefs?.referenceUrls?.filter((u: string) => u.trim()).length
      ? `레퍼런스 홈페이지: ${designPrefs.referenceUrls.filter((u: string) => u.trim()).join(", ")}`
      : "";
    const featuresText = designPrefs?.features?.length
      ? `원하는 기능: ${designPrefs.features.map((f: string) => featureLabel[f] || f).join(", ")}`
      : "";

    const systemPrompt = `당신은 병원 홈페이지 콘텐츠 전문 기획자이자 UX 카피라이터입니다.
병원 정보와 디자인 방향을 받아서 홈페이지 텍스트 콘텐츠를 JSON으로 생성합니다.

핵심 원칙:
- 헤드라인은 짧고 강렬하게 (15자 이내)
- 소개문은 진료 철학과 차별점을 담아 신뢰감 있게
- 진료항목은 실제 병원에 맞게 구체적으로
- 강조 포인트와 레이아웃 스타일을 콘텐츠 톤에 반영
- 레퍼런스 URL이 있다면 해당 병원의 방향성과 유사한 톤으로 작성

반드시 다음 JSON 구조로만 응답하세요 (코드블록 없이 순수 JSON):
{
  "hero": {
    "headline": "메인 헤드라인 (병원 강점, 15자 이내)",
    "subline": "서브 문구 (진료 철학이나 차별점, 30자 이내)",
    "cta": "CTA 버튼 텍스트 (예: 지금 예약하기)"
  },
  "about": {
    "title": "병원 소개 섹션 제목",
    "body": "병원 소개 본문 2-3문장 (신뢰감 있게, 강조 포인트 반영)"
  },
  "services": [
    { "name": "진료항목명", "desc": "한 줄 설명 (환자 관점으로)" }
  ],
  "doctors": [
    { "name": "원장명", "title": "직책/전문분야", "bio": "한 줄 소개" }
  ],
  "notice": {
    "title": "공지사항 또는 이벤트 제목",
    "body": "내용 한 문장"
  },
  "location": {
    "address": "주소",
    "hours": "진료시간 (평일/토요일/공휴일 형태로)",
    "parking": "주차 안내"
  },
  "footer": {
    "copy": "Copyright © 2025 병원명. All rights reserved.",
    "tagline": "병원 슬로건 (짧고 기억에 남게)"
  },
  "colorTheme": "green 또는 blue 또는 dark (병원 분위기에 맞게)",
  "keywords": ["SEO 키워드1", "SEO 키워드2", "SEO 키워드3", "SEO 키워드4"]
}`;

    const userMsg = `=== 병원 기본 정보 ===
병원명: ${hospitalName}
원장명: ${doctorName || "미입력"}
진료과: ${specialties || "미입력"}
전화번호: ${phone || "미입력"}
주소: ${address || "미입력"}
콘셉트/분위기: ${concept || "깔끔하고 신뢰감 있는"}
구성 페이지: ${pages?.join(", ") || "메인, 소개, 진료항목, 오시는길"}
추가 요청: ${memo || "없음"}

=== 디자인 방향 ===
레이아웃 스타일: ${layoutLabel[designPrefs?.layoutStyle] || "심플·미니멀"}
폰트 스타일: ${fontLabel[designPrefs?.fontStyle] || "고딕체"}
페이지 구조: ${pageLabel[designPrefs?.pageType] || "멀티페이지"}
강조 포인트: ${emphasisLabel[designPrefs?.emphasisPoint] || "원장·의료진 중심"}
${refUrlsText}
${featuresText}
추가 디자인 메모: ${designPrefs?.additionalNote || "없음"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: "user", content: userMsg },
        ],
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "{}";

    let content;
    try {
      content = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      content = match ? JSON.parse(match[0]) : {};
    }

    return NextResponse.json({ content });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
