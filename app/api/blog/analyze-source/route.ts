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

  let body: { title?: string; body?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문 파싱 실패" }, { status: 400 });
  }

  const { title, body: postBody, category } = body;
  if (!title?.trim() || !postBody?.trim()) {
    return NextResponse.json({ ok: false, error: "제목과 본문을 입력해주세요." }, { status: 400 });
  }

  const systemPrompt =
    "당신은 블로그 글쓰기 패턴 분석 전문가입니다. 병원 마케팅 블로그 글의 글쓰기 패턴을 분석합니다.\n\n반드시 아래 JSON 형식으로만 응답하세요:\n{\n  \"titlePattern\": \"제목 패턴 설명\",\n  \"openingPattern\": \"도입부 패턴 설명\",\n  \"bodyStructure\": \"본문 구조 설명\",\n  \"commonPhrases\": [\"자주 쓰는 표현1\", \"표현2\"],\n  \"tone\": \"톤앤매너 설명\",\n  \"keyMessages\": [\"핵심 메시지1\", \"메시지2\"],\n  \"ctaPattern\": \"CTA 패턴 설명\"\n}";

  const userPrompt = `다음 블로그 글의 패턴을 분석하세요. 제목 패턴, 도입부 패턴, 본문 구조, 자주 쓰는 표현, 톤앤매너, 핵심 메시지, CTA 패턴을 JSON으로 반환하세요.\n\n제목: ${title}\n카테고리: ${category || "기타"}\n\n본문:\n${postBody}`;

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
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
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
      titlePattern: data.titlePattern ?? "",
      openingPattern: data.openingPattern ?? "",
      bodyStructure: data.bodyStructure ?? "",
      commonPhrases: data.commonPhrases ?? [],
      tone: data.tone ?? "",
      keyMessages: data.keyMessages ?? [],
      ctaPattern: data.ctaPattern ?? "",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 });
  }
}
