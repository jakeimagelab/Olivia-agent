import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
    if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: "No Anthropic API key" }, { status: 500 });

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // 디자인 프리퍼런스 레이블
    const layoutLabel: Record<string, string> = {
      simple: "심플·미니멀 (여백 넓고 깔끔)", modern: "모던·세련 (섹션 구분 명확)",
      warm: "따뜻·친근 (부드럽고 친근)", premium: "고급·프리미엄 (고급스럽고 신뢰)"
    };
    const fontLabel: Record<string, string> = {
      gothic: "고딕체 (가독성 최우선)", serif: "명조체 (고급스럽고 전통적)",
      round: "둥근 고딕 (부드럽고 친근)", mix: "제목 명조 + 본문 고딕 (균형감)"
    };
    const pageLabel: Record<string, string> = {
      landing: "원페이지 랜딩", multi: "멀티페이지", hybrid: "하이브리드"
    };
    const emphasisLabel: Record<string, string> = {
      doctor: "원장·의료진 중심", service: "시술·진료항목 중심",
      review: "후기·신뢰도 중심", location: "위치·접근성 중심", equipment: "장비·시설 중심"
    };
    const featureLabel: Record<string, string> = {
      kakao: "카카오톡 상담", naver: "네이버 예약", map: "지도·오시는길",
      popup: "이벤트 팝업", chat: "채팅 상담", gallery: "포토 갤러리",
      faq: "FAQ", sns: "SNS 링크", tel: "전화 클릭", review: "후기·리뷰"
    };

    const refUrlsText = designPrefs?.referenceUrls?.filter((u: string) => u.trim()).length
      ? `\n레퍼런스 홈페이지: ${designPrefs.referenceUrls.filter((u: string) => u.trim()).join(", ")}`
      : "";
    const featuresText = designPrefs?.features?.length
      ? `\n포함할 기능: ${designPrefs.features.map((f: string) => featureLabel[f] || f).join(", ")}`
      : "";

    const systemPrompt = `당신은 병원 홈페이지 전문 UX 카피라이터이자 콘텐츠 기획자입니다.
병원 정보와 디자인 방향을 기반으로, 실제 병원 홈페이지에 바로 사용할 수 있는 고품질 텍스트 콘텐츠를 생성합니다.

## 핵심 원칙
- 헤드라인: 짧고 강렬하게 (12자 이내), 병원의 핵심 강점 표현
- 소개문: 환자 신뢰를 얻는 따뜻하고 전문적인 어조
- 진료항목: 환자 관점에서 이해하기 쉬운 표현
- 강조 포인트와 레이아웃 스타일을 콘텐츠 톤에 완전히 반영
- 병원명, 진료과, 원장명이 있으면 반드시 실제로 활용

## 응답 형식
반드시 다음 JSON만 응답 (코드블록, 설명 없이 순수 JSON):
{
  "hero": {
    "headline": "헤드라인 (12자 이내, 핵심 강점)",
    "subline": "서브카피 (30자 이내, 진료 철학·차별점)",
    "cta": "CTA 버튼 텍스트"
  },
  "about": {
    "title": "병원 소개 섹션 제목",
    "body": "소개 본문 2~3문장 (환자 신뢰 확보, 강조 포인트 반영)"
  },
  "services": [
    { "name": "진료항목명", "desc": "환자 관점 한 줄 설명" }
  ],
  "doctors": [
    { "name": "원장명", "title": "직책/전문분야", "bio": "신뢰감 있는 한 줄 소개" }
  ],
  "notice": {
    "title": "공지 또는 이벤트 제목",
    "body": "내용 한 문장"
  },
  "location": {
    "address": "주소",
    "hours": "진료시간 (평일/토/공휴일 형태)",
    "parking": "주차 안내"
  },
  "footer": {
    "copy": "Copyright © 2025 병원명. All rights reserved.",
    "tagline": "기억에 남는 슬로건 (10자 이내)"
  },
  "colorTheme": "green 또는 blue 또는 dark",
  "keywords": ["지역+진료과 키워드", "병원명 키워드", "증상 키워드", "SEO 키워드"]
}`;

    const userMsg = `=== 병원 정보 ===
병원명: ${hospitalName}
원장명: ${doctorName || "미입력"}
진료과: ${specialties || "미입력"}
전화번호: ${phone || "미입력"}
주소: ${address || "미입력"}
콘셉트: ${concept || "깔끔하고 신뢰감 있는"}
구성 페이지: ${pages?.join(", ") || "메인, 소개, 진료항목, 오시는길"}
특이사항: ${memo || "없음"}

=== 디자인 방향 ===
레이아웃: ${layoutLabel[designPrefs?.layoutStyle] || "심플·미니멀"}
폰트: ${fontLabel[designPrefs?.fontStyle] || "고딕체"}
페이지 구조: ${pageLabel[designPrefs?.pageType] || "멀티페이지"}
강조 포인트: ${emphasisLabel[designPrefs?.emphasisPoint] || "원장·의료진 중심"}${refUrlsText}${featuresText}
추가 요청: ${designPrefs?.additionalNote || "없음"}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: systemPrompt + "\n\n" + userMsg
        }
      ]
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "{}";

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
