import { NextRequest, NextResponse } from "next/server";
import { PC_STYLE } from "@/lib/photoclinic-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { contentType, dept, customNote, tone } = await req.json();

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return NextResponse.json({ ok: true, mock: true, ...getMock(contentType, dept) });

    const fixedTags = PC_STYLE.fixedHashtags.join(" ");
    const topicTags = (PC_STYLE.topicHashtags[contentType as keyof typeof PC_STYLE.topicHashtags] || PC_STYLE.topicHashtags.portfolio).join(" ");
    const deptTags  = dept ? (PC_STYLE.deptHashtags[dept as keyof typeof PC_STYLE.deptHashtags] || []).join(" ") : "";

    const prompt = `당신은 포토클리닉(@photoclinic_kr) 인스타그램 콘텐츠 담당자입니다.
포토클리닉은 병원 브랜딩 전문 사진·영상 스튜디오입니다.

【포토클리닉 인스타 스타일 가이드 — 반드시 준수】
- 톤: 따뜻하고 감성적인 필름 느낌. 병원사진이지만 사람 냄새 나는 온기
- 캡션: 스토리텔링형 5~8줄. 촬영 현장의 이야기, 사람의 감정, 순간의 서사
- 구조: 현장 묘사 → 감정 전환 → 포토클리닉의 철학으로 마무리
- 줄바꿈: 2~3줄마다 한 번. 숨 쉬는 리듬
- 시점: 1인칭(우리, 저희). 포토클리닉이 직접 경험한 이야기처럼
- 금지: 광고 문구, 과장 표현, 효과 보장, 짧고 단편적인 캡션
- 말투: 담담하고 진솔하게. 감동을 강요하지 않음

콘텐츠 유형: ${contentType}
진료과목: ${dept || "병원(미지정)"}
추가 참고: ${customNote || "없음"}
분위기: ${tone || "따뜻·감성"}

아래 JSON만 반환 (다른 텍스트 없이):
{
  "captions": [
    {
      "type": "현장 스토리",
      "text": "촬영 당일의 구체적인 장면에서 시작하는 5~8줄 스토리텔링 캡션.\\n\\n(두 번째 문단) 그 장면에서 느낀 감정이나 발견.\\n\\n(세 번째 문단) 포토클리닉이 이 일을 하는 이유로 마무리."
    },
    {
      "type": "감성 서사",
      "text": "사진이나 공간에서 받은 인상에서 시작하는 5~8줄 감성 캡션.\\n\\n(두 번째 문단) 그 인상이 왜 중요한지.\\n\\n(세 번째 문단) 병원 브랜딩에 대한 포토클리닉의 생각."
    },
    {
      "type": "사람 이야기",
      "text": "원장님이나 의료진의 이야기에서 시작하는 5~8줄 인물 중심 캡션.\\n\\n(두 번째 문단) 촬영 중 포착한 진심의 순간.\\n\\n(세 번째 문단) 사람을 담는 일에 대한 포토클리닉의 철학."
    }
  ],
  "hashtags": "${fixedTags} ${topicTags} ${deptTags} #병원사진작가 #의료브랜딩"
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || JSON.stringify(errBody);
      console.error(`Claude API ${res.status}: ${errMsg}`);
      return NextResponse.json({ ok: true, mock: true, ...getMock(contentType, dept) });
    }
    const data = await res.json();
    const txt  = (data.content || []).map((b: any) => b.text || "").join("");
    const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
    const parsed = JSON.parse(txt.slice(s, e + 1));
    return NextResponse.json({ ok: true, ...parsed });

  } catch (err: any) {
    return NextResponse.json({ ok: true, mock: true, ...getMock("portfolio", "") });
  }
}

function getMock(contentType: string, dept: string) {
  const d = dept || "병원";
  const templates: Record<string, any> = {
    portfolio: { captions: [
      { type: "현장 스토리",
        text: `촬영 당일, 원장님은 긴장하셨습니다.\n사진 찍히는 걸 좋아하지 않는다고 하셨어요.\n\n그런데 셔터를 누르는 순간,\n카메라 앞에서도 원장님의 따뜻함은\n숨길 수가 없었습니다.\n\n사진은 거짓말을 하지 않아요.\n그래서 저희는 이 일이 좋습니다.` },
      { type: "감성 서사",
        text: `${d} 공간을 처음 들어섰을 때,\n햇빛이 유독 따뜻하게 들어오고 있었습니다.\n\n'이 빛을 그냥 지나치면 안 되겠다'\n싶었어요.\n\n좋은 사진은 계획이 아니라\n그 순간을 알아보는 눈에서 나온다고 생각합니다.\n포토클리닉이 현장을 먼저 걷는 이유입니다.` },
      { type: "사람 이야기",
        text: `촬영이 끝날 무렵,\n원장님이 조용히 말씀하셨습니다.\n"이런 사진, 처음 받아봐요."\n\n저희에게는 그 말 한마디가\n가장 큰 인정입니다.\n\n병원의 이야기를 담는 일,\n계속하겠습니다.` },
    ]},
    bts: { captions: [
      { type: "현장 스토리",
        text: `촬영 시작 전,\n항상 병원을 한 바퀴 걷습니다.\n\n어느 공간에 빛이 들어오는지,\n어느 각도에서 사람이 가장 자연스러운지,\n잠시 들여다보는 시간.\n\n그 시간이 사진의 절반입니다.` },
      { type: "감성 서사",
        text: `오늘도 새벽에 출발했습니다.\n병원이 열리기 전,\n아무도 없는 공간에서\n빛이 어떻게 움직이는지 보고 싶었거든요.\n\n빈 공간은 정직합니다.\n사람이 들어오기 전의 그 공기를\n사진에 담아두고 싶었습니다.` },
      { type: "사람 이야기",
        text: `스탭 분들이 수고하셨습니다.\n촬영 내내 웃으며 함께해주셨어요.\n\n카메라 밖에서 보면\n병원이 얼마나 따뜻한 사람들로\n채워져 있는지 느낍니다.\n\n그 온기가 사진에도 담겼으면 합니다.` },
    ]},
    philosophy: { captions: [
      { type: "현장 스토리",
        text: `오래된 병원 사진을 교체하고 싶다는\n원장님의 연락을 받았을 때,\n저희가 먼저 한 것은 기존 사진을 보는 일이었습니다.\n\n10년 전 사진이었지만,\n원장님의 진심은 그때도 충분히 담겨 있었어요.\n\n사진은 시간이 지나도\n그 사람의 태도를 기억합니다.` },
      { type: "감성 서사",
        text: `병원사진은 예쁜 사진이 아니어도 됩니다.\n\n환자가 처음 홈페이지를 열었을 때,\n'여기라면 괜찮겠다'는 마음이 드는 것.\n그게 좋은 병원사진입니다.\n\n포토클리닉이 만들어가는\n신뢰의 이미지.` },
      { type: "사람 이야기",
        text: `원장님들을 만날 때마다 느낍니다.\n\n좋은 의사는 사진보다 먼저\n환자를 대하는 태도로 이미 브랜드를\n만들고 계신다는 것을.\n\n저희 일은 그 태도를\n눈에 보이게 하는 것입니다.` },
    ]},
    space: { captions: [
      { type: "현장 스토리",
        text: `로비에 들어서자마자\n멈췄습니다.\n\n천장에서 내려오는 자연광이\n대리석 바닥에 길게 드리워져 있었어요.\n\n이 공간을 설계한 사람이\n얼마나 많이 생각했는지\n빛 한 줄기에서 느껴졌습니다.\n\n그걸 사진으로 남겨두고 싶었어요.` },
      { type: "감성 서사",
        text: `공간은 말을 합니다.\n\n이 병원에 들어서는 순간\n환자들이 어떤 감정을 느끼는지,\n의자 하나 조명 하나에 담겨 있어요.\n\n그 디테일들을 카메라에 담는 것.\n그게 공간 촬영입니다.` },
      { type: "사람 이야기",
        text: `원장님이 직접 하나하나 고르셨다고 했습니다.\n소품 하나, 식물 한 화분까지.\n\n그 마음이 공간 곳곳에 배어 있었어요.\n\n환자들이 그 마음을 느낄 수 있도록\n사진에 담았습니다.` },
    ]},
    profile: { captions: [
      { type: "현장 스토리",
        text: `"사진 찍는 거 정말 어색한데."\n\n촬영 시작 전 원장님이 하신 말씀입니다.\n저희가 매번 듣는 말이에요.\n\n그래서 저희는 카메라를 바로 들지 않습니다.\n그냥 이야기를 나눕니다.\n좋아하는 것, 이 병원을 시작한 이유.\n\n그러다 보면 어느 순간\n원장님이 원장님이 됩니다.` },
      { type: "감성 서사",
        text: `프로필 사진은\n얼굴을 찍는 게 아닙니다.\n\n그 사람이 지금까지 어떻게 살아왔는지,\n어떤 의사가 되고 싶었는지,\n환자를 어떻게 대하는 사람인지.\n\n그걸 한 장에 담는 것이\n저희가 생각하는 의료진 프로필입니다.` },
      { type: "사람 이야기",
        text: `촬영이 끝나고 원장님이 사진을 보셨습니다.\n한참을 보시다가\n"이게 저예요?"라고 하셨어요.\n\n맞습니다.\n항상 그게 당신이었는데\n카메라가 처음으로 보여준 것뿐입니다.` },
    ]},
  };

  const t = templates[contentType] || templates.portfolio;
  return {
    ...t,
    hashtags: `#포토클리닉 #photoclinic #병원사진 #병원브랜딩 #의료진프로필 #병원사진촬영 #원장프로필 #병원홍보사진 ${dept ? `#${dept} #${dept}촬영 #${dept}브랜딩` : ""} #포트폴리오 #병원사진작가 #의료브랜딩`,
  };
}
