import { NextRequest, NextResponse } from "next/server";
import { PC_STYLE } from "@/lib/photoclinic-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewInput = {
  hospital_name?: string;
  reviewer_name?: string;
  review_text?: string;
  rating?: number;
  channel?: string;
};

export async function POST(req: NextRequest) {
  const { hospitalName, reviews = [], angle = "납품 후기" } = await req.json() as {
    hospitalName?: string;
    reviews?: ReviewInput[];
    angle?: string;
  };

  const cleanReviews = reviews
    .map((review) => review.review_text || "")
    .filter(Boolean)
    .slice(0, 12);

  if (!cleanReviews.length) {
    return NextResponse.json({ ok: false, error: "콘텐츠로 만들 리뷰를 선택해주세요." }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: true, mock: true, ...mockContent(hospitalName || "병원", cleanReviews) });
  }

  const fixedTags = PC_STYLE.fixedHashtags.join(" ");
  const prompt = `당신은 포토클리닉(@photoclinic_kr)의 인스타그램 콘텐츠 에디터입니다.
포토클리닉은 병원 브랜딩 전문 사진·영상 스튜디오입니다.

아래는 사진/영상 납품 후 받은 고객 리뷰입니다.
리뷰를 요약하고, 인스타그램 콘텐츠로 바로 다듬어 주세요.

병원명: ${hospitalName || "미지정"}
콘텐츠 관점: ${angle}
리뷰:
${cleanReviews.map((review, index) => `${index + 1}. ${review}`).join("\n")}

반드시 아래 JSON만 반환하세요.
{
  "summary": "리뷰 핵심을 2~3문장으로 요약",
  "insights": ["반복적으로 드러난 만족 포인트", "콘텐츠로 강조할 포인트", "다음 촬영 개선 포인트"],
  "carousel": [
    {"title": "카드뉴스 1장 제목", "body": "짧은 본문"},
    {"title": "카드뉴스 2장 제목", "body": "짧은 본문"},
    {"title": "카드뉴스 3장 제목", "body": "짧은 본문"},
    {"title": "카드뉴스 4장 제목", "body": "짧은 본문"}
  ],
  "caption": "포토클리닉 스타일의 5~8줄 인스타그램 캡션. 광고처럼 과장하지 말고 현장과 감정을 담담하게 연결.",
  "hashtags": "${fixedTags} #병원사진 #병원브랜딩 #납품후기 #병원촬영후기"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1600,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) return NextResponse.json({ ok: true, mock: true, ...mockContent(hospitalName || "병원", cleanReviews) });
    const data = await res.json();
    const text = (data.content || []).map((block: any) => block.text || "").join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(start, end + 1));
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, mock: true, ...mockContent(hospitalName || "병원", cleanReviews) });
  }
}

function mockContent(hospitalName: string, reviews: string[]) {
  const first = reviews[0] || "";
  return {
    summary: `${hospitalName} 납품 후기는 결과물의 분위기와 병원다움이 잘 표현됐다는 반응이 핵심입니다. 특히 사진을 받은 뒤 내부 구성원이 함께 만족했다는 점이 콘텐츠 포인트로 좋습니다.`,
    insights: [
      "사진의 완성도보다 병원의 분위기와 신뢰감이 잘 전달됐다는 반응이 중요합니다.",
      "원장님과 직원들이 결과물을 함께 확인하는 장면을 콘텐츠 서사로 활용할 수 있습니다.",
      "다음 촬영에서는 결과물을 어디에 활용했는지까지 함께 수집하면 후속 콘텐츠가 더 강해집니다."
    ],
    carousel: [
      { title: "납품 후 가장 먼저 온 반응", body: first || "사진을 보고 병원의 분위기가 잘 담겼다는 이야기를 들었습니다." },
      { title: "좋은 병원사진의 기준", body: "예쁘게 보이는 것보다 병원이 가진 태도와 신뢰가 전해지는 것." },
      { title: "결과물이 쓰이는 순간", body: "홈페이지, 블로그, 인스타그램에서 병원의 첫인상을 다시 정리합니다." },
      { title: "포토클리닉이 남기는 일", body: "촬영은 끝났지만 병원이 기억되는 이미지는 그때부터 시작됩니다." }
    ],
    caption: `납품 후 받은 짧은 한마디가\n촬영의 방향이 맞았다는 걸 알려줄 때가 있습니다.\n\n${hospitalName}의 사진을 정리하며\n우리가 담고 싶었던 건 공간의 예쁨보다\n그 병원이 환자를 맞이하는 태도였습니다.\n\n사진은 결국 병원이 가진 마음을\n조금 더 선명하게 보여주는 일이라고 믿습니다.`,
    hashtags: "#포토클리닉 #photoclinic #병원사진 #병원브랜딩 #납품후기 #병원촬영후기 #의료브랜딩"
  };
}
