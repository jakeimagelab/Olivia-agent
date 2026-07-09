import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Mode = "benchmark" | "story" | "thumbnail";

function jsonFromText(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("JSON 응답을 찾을 수 없습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

async function fetchYoutubeMeta(url: string) {
  try {
    const target = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OliviaYoutubePlanner/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const desc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      "";
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
    return [
      `URL: ${target}`,
      title && `title: ${strip(title)}`,
      ogTitle && `og:title: ${strip(ogTitle)}`,
      desc && `description: ${strip(desc)}`,
      ogImage && `thumbnail: ${ogImage}`,
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

function strip(text: string) {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(mode: Mode, body: any, meta: string) {
  if (mode === "benchmark") {
    return `당신은 병원 유튜브 콘텐츠를 분석하는 포토클리닉 올리비아 에이전트입니다.
유튜브 URL과 사용자가 입력한 0-60초 구간 메모를 바탕으로 벤치마킹 리포트를 만듭니다.

유튜브 메타:
${meta || "수집된 메타 없음"}

사용자 입력:
URL: ${body.url || ""}
0-60초 메모/자막: ${body.firstMinuteMemo || "없음"}
참고 메모: ${body.notes || "없음"}

아래 JSON만 반환하세요.
{
  "thumbnailCheck": ["썸네일 문구/인물/배경/색감/시선 유도 분석 1", "분석 2", "병원 콘텐츠 적용 포인트"],
  "firstMinuteSummary": {
    "hook": "0-5초 훅 분석",
    "problem": "5-15초 문제 제기",
    "core": "15-40초 핵심 전개",
    "transition": "40-60초 전환/CTA",
    "summary": "1분 구간 전체 요약"
  },
  "structure": ["도입부", "문제 제기", "신뢰 형성", "사례/정보 전달", "CTA"],
  "features": ["제목 패턴", "말투/톤", "편집 리듬", "자막 스타일", "후킹 방식"],
  "takeaways": ["포토클리닉 병원 유튜브에 가져올 포인트 1", "포인트 2", "포인트 3"],
  "riskNotes": ["의료/병원 콘텐츠에서 피해야 할 표현이나 연출"]
}`;
  }

  if (mode === "story") {
    return `당신은 병원 유튜브 콘텐츠 기획자이자 한국 의료광고 심의 기준을 검토하는 에디터입니다.
벤치마킹 결과와 입력값을 바탕으로 병원 유튜브 콘텐츠 스토리를 생성하고 의료심의 리스크를 함께 점검하세요.

입력:
병원명: ${body.hospitalName || ""}
진료과: ${body.department || ""}
주제: ${body.topic || ""}
타깃: ${body.targetAudience || ""}
톤: ${body.tone || ""}
핵심 메시지: ${body.keyMessage || ""}
벤치마킹 요약: ${body.benchmarkSummary || "없음"}

아래 JSON만 반환하세요.
{
  "concept": "콘텐츠 콘셉트 한 문장",
  "hook": "첫 5초 훅",
  "storyStructure": ["도입", "문제 제기", "해결 관점", "신뢰 근거", "CTA"],
  "storyboard": [
    { "time": "0-5초", "scene": "장면", "caption": "자막", "narration": "내레이션" },
    { "time": "5-15초", "scene": "장면", "caption": "자막", "narration": "내레이션" },
    { "time": "15-40초", "scene": "장면", "caption": "자막", "narration": "내레이션" },
    { "time": "40-60초", "scene": "장면", "caption": "자막", "narration": "내레이션" }
  ],
  "cta": "안전한 상담/문의 유도 문구",
  "thumbnailTexts": ["썸네일 문구 후보 1", "후보 2", "후보 3"],
  "medicalReview": {
    "risk": "낮음|주의|위험",
    "issues": [
      { "original": "문제 표현", "reason": "위험 사유", "safeAlternative": "안전한 대체 문구" }
    ],
    "checklist": ["검수 체크 1", "검수 체크 2", "검수 체크 3"]
  }
}`;
  }

  return `당신은 유튜브 썸네일 디렉터입니다. 병원 콘텐츠용 썸네일 문구와 레이아웃을 추천하세요.

입력:
병원명: ${body.hospitalName || ""}
영상 주제: ${body.topic || ""}
썸네일 텍스트: ${body.thumbnailText || ""}
템플릿: ${body.template || ""}
추가 메모: ${body.notes || ""}

아래 JSON만 반환하세요.
{
  "headlineOptions": ["문구 후보 1", "문구 후보 2", "문구 후보 3"],
  "layoutGuide": ["원장 사진 배치", "배경 처리", "텍스트 강조 방식"],
  "colorGuide": "추천 색감",
  "riskNotes": ["썸네일에서 피해야 할 의료광고 표현"]
}`;
}

async function callClaude(prompt: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 미설정");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 2200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((block: any) => block.text || "").join("");
  return jsonFromText(text);
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("AI 응답 시간이 초과되었습니다.")), ms);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode as Mode;
    if (!["benchmark", "story", "thumbnail"].includes(mode)) {
      return NextResponse.json({ ok: false, error: "지원하지 않는 mode입니다." }, { status: 400 });
    }
    const meta = mode === "benchmark" && body.url ? await fetchYoutubeMeta(body.url) : "";
    const prompt = buildPrompt(mode, body, meta);
    try {
      const result = await Promise.race([callClaude(prompt), timeoutAfter(16000)]);
      return NextResponse.json({ ok: true, mode, ...result });
    } catch {
      return NextResponse.json({ ok: true, mode, mock: true, ...mockResult(mode) });
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "요청 처리 실패" }, { status: 500 });
  }
}

function mockResult(mode: Mode) {
  if (mode === "benchmark") {
    return {
      thumbnailCheck: ["인물 시선과 큰 문구로 클릭 포인트를 만듭니다.", "배경은 단순하고 텍스트 대비가 큽니다.", "병원 콘텐츠에는 과장 문구보다 궁금증형 문구가 적합합니다."],
      firstMinuteSummary: { hook: "첫 5초에 문제를 직접 던집니다.", problem: "시청자가 겪는 불편을 구체화합니다.", core: "핵심 정보를 2-3개 포인트로 나눕니다.", transition: "다음 행동이나 다음 파트로 자연스럽게 연결합니다.", summary: "문제 제기 후 신뢰 가능한 설명으로 관심을 유지하는 구조입니다." },
      structure: ["질문형 훅", "공감 문제 제기", "전문가 관점 설명", "짧은 사례", "상담 전 확인 유도"],
      features: ["제목은 궁금증형", "톤은 담백한 전문가형", "편집은 빠른 컷 전환", "자막은 핵심 단어 강조", "훅은 질문으로 시작"],
      takeaways: ["첫 문장은 환자 관점 질문으로 시작", "전문 용어는 쉬운 말로 번역", "CTA는 상담 보장이 아닌 확인 유도로 표현"],
      riskNotes: ["효과 보장, 최고/유일, 전후 비교를 직접 강조하지 않습니다."],
    };
  }
  if (mode === "story") {
    return {
      concept: "환자가 상담 전 가장 궁금해하는 질문을 원장이 1분 안에 정리하는 콘텐츠",
      hook: "이 질문, 상담 전에 꼭 확인하세요.",
      storyStructure: ["질문형 도입", "환자 고민 제시", "전문가 관점 정리", "확인 체크리스트", "상담 유도"],
      storyboard: [
        { time: "0-5초", scene: "원장 정면 클로즈업", caption: "상담 전 꼭 묻는 질문", narration: "많이 물어보시는 질문부터 짚어볼게요." },
        { time: "5-15초", scene: "상담실 B-roll", caption: "개인마다 기준이 다릅니다", narration: "같은 고민이어도 필요한 방향은 다를 수 있습니다." },
        { time: "15-40초", scene: "체크리스트 그래픽", caption: "확인할 3가지", narration: "상태, 생활 패턴, 기대치를 함께 확인해야 합니다." },
        { time: "40-60초", scene: "원장 마무리", caption: "상담에서 확인하세요", narration: "정확한 방향은 상담을 통해 확인해 주세요." },
      ],
      cta: "개인별 상태에 맞는 방향은 상담을 통해 확인해 주세요.",
      thumbnailTexts: ["상담 전 꼭 확인할 것", "이 질문 먼저 하세요", "원장이 말하는 체크포인트"],
      medicalReview: { risk: "낮음", issues: [], checklist: ["효과 보장 표현 없음", "개인차 안내 포함", "상담 유도 문구 안전"] },
    };
  }
  return {
    headlineOptions: ["상담 전 꼭 확인할 것", "이 질문 먼저 하세요", "원장이 말하는 체크포인트"],
    layoutGuide: ["원장 사진은 좌측 40%에 크게 배치", "배경은 밝게 흐림 처리", "핵심 텍스트는 2줄 이내로 우측 배치"],
    colorGuide: "딥그린 + 화이트 + 오렌지 포인트",
    riskNotes: ["100%, 완치, 최고 같은 보장/비교 표현은 피합니다."],
  };
}
