import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── 올리비아가 사용할 도구 정의 ──────────────────────────
const TOOLS = [
  {
    name: "create_quote",
    description: "견적서를 생성합니다. 병원명, 패키지, 옵션 정보를 받아 견적서 페이지로 이동합니다.",
    input_schema: {
      type: "object",
      properties: {
        hospitalName:  { type: "string",  description: "병원명 또는 고객사명" },
        packageId:     { type: "string",  description: "패키지 ID: premium | premium_plus | homepage | branding" },
        contactName:   { type: "string",  description: "담당자명" },
        email:         { type: "string",  description: "이메일" },
        phone:         { type: "string",  description: "연락처" },
        shootDate:     { type: "string",  description: "촬영예정일 (YYYY-MM-DD)" },
        profileCount:  { type: "number",  description: "프로필 추가 인원수" },
        stagedCount:   { type: "number",  description: "연출 추가 인원수" },
        floorCount:    { type: "number",  description: "인테리어 층수 추가" },
        largeHospital: { type: "boolean", description: "병원급 규모 여부" },
        droneCount:    { type: "number",  description: "드론 촬영 횟수" },
        memo:          { type: "string",  description: "메모" },
      },
      required: ["hospitalName"],
    },
  },
  {
    name: "send_file_transfer",
    description: "촬영 파일 전송 메일을 발송합니다. NAS 링크를 고객에게 이메일로 보냅니다.",
    input_schema: {
      type: "object",
      properties: {
        hospitalName: { type: "string", description: "고객사명" },
        toName:       { type: "string", description: "담당자명" },
        toEmail:      { type: "string", description: "수신 이메일" },
        nasLink:      { type: "string", description: "NAS 다운로드 링크" },
        shootDate:    { type: "string", description: "촬영일" },
        packageName:  { type: "string", description: "촬영 내용/패키지명" },
        fileCount:    { type: "number", description: "전달 파일 수량" },
        message:      { type: "string", description: "추가 메시지" },
      },
      required: ["hospitalName", "toEmail", "nasLink"],
    },
  },
  {
    name: "create_conti",
    description: "촬영 콘티를 생성합니다. 병원 정보를 바탕으로 촬영 일정표, 공간 분석, 장면 연출을 자동 작성합니다.",
    input_schema: {
      type: "object",
      properties: {
        hospitalName: { type: "string", description: "병원명" },
        dept:         { type: "string", description: "진료과 (예: 피부과, 성형외과)" },
        shootDate:    { type: "string", description: "촬영예정일" },
        spaces:       { type: "string", description: "공간 정보 (예: 1F 로비·상담실, 2F 진료실)" },
        doctors:      { type: "string", description: "의료진 정보 (예: 원장 2명, 실장 1명)" },
        extras:       { type: "string", description: "추가 요청사항" },
      },
      required: ["hospitalName", "dept", "shootDate", "spaces"],
    },
  },
  {
    name: "open_page",
    description: "특정 페이지로 이동합니다.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["quote", "conti", "delivery-mail", "diagnosis", "channel-analyzer", "instagram-promo-design", "photo-sorting"],
          description: "이동할 페이지",
        },
      },
      required: ["page"],
    },
  },
];

const SYSTEM_PROMPT = `당신은 포토클리닉(병원 전문 브랜드 촬영 스튜디오)의 AI 비서 올리비아입니다.
대표님(정연호)의 업무를 도와드립니다.

포토클리닉 서비스:
- 견적서 생성: 병원 촬영 패키지 견적서 PDF 생성
- 파일 전송: 촬영 완료 후 NAS 링크를 고객에게 이메일 발송
- 촬영 콘티: 병원 정보 기반 촬영 계획서 자동 생성
- 채널 분석, 인스타그램 디자인, 사진 분류 시스템 등

패키지 정보:
- Premium (150만원): 원장·의료진 프로필, 진료 연출, 병원 인테리어
- Premium Plus (250만원): Premium + 브랜드 영상, 스토리 영상
- Homepage (350만원): Premium + 홈페이지 제작
- Branding Content (200만원): 블로그·SNS 콘텐츠, 언론 홍보

대화 규칙:
1. 짧고 친근하게 대화합니다
2. 필요한 정보가 부족하면 자연스럽게 물어봅니다
3. 기능 실행 전 반드시 승인을 요청합니다 (tool을 직접 호출하지 않고 confirm: true로 표시)
4. 한국어로만 대화합니다`;

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const body = await req.json();
  const { messages, pendingTool } = body;

  // 승인된 도구 실행
  if (pendingTool) {
    const result = await executeTool(pendingTool.name, pendingTool.input, req);
    return NextResponse.json({ ok: true, toolResult: result });
  }

  // Claude API 호출
  // OpenAI function calling 형식으로 변환
  const openaiTools = TOOLS.map((t: any) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const openaiMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1024,
      tools: openaiTools,
      tool_choice: "auto",
      messages: openaiMessages,
    }),
  });

  if (!res.ok) {
    let errMsg = "OpenAI API 오류 " + res.status;
    try { const e = await res.json(); errMsg = e.error?.message || errMsg; } catch(e) {}
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }

  const rawText = await res.text();
  if (!rawText || rawText.trim() === "") {
    return NextResponse.json({ ok: false, error: "OpenAI 응답이 비어있습니다. API 키를 확인해주세요." }, { status: 500 });
  }
  let data: any;
  try { data = JSON.parse(rawText); } catch(e) {
    return NextResponse.json({ ok: false, error: "응답 파싱 실패: " + rawText.slice(0, 200) }, { status: 500 });
  }
  if (data.error) {
    return NextResponse.json({ ok: false, error: "OpenAI 오류: " + (data.error.message || JSON.stringify(data.error)) }, { status: 500 });
  }
  const choice = data.choices?.[0];
  const msg    = choice?.message;

  // 도구 호출
  if (msg?.tool_calls?.length > 0) {
    const tc = msg.tool_calls[0];
    let input: any = {};
    try { input = JSON.parse(tc.function.arguments); } catch(e) {}
    return NextResponse.json({
      ok: true,
      type: "tool_request",
      text: msg.content || "",
      tool: {
        name:  tc.function.name,
        input,
        id:    tc.id,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    type: "message",
    text: msg?.content || "",
  });
}

// ── 도구 실행 ────────────────────────────────────────────
async function executeTool(name: string, input: any, req: NextRequest) {
  switch (name) {
    case "create_quote": {
      // 견적서 페이지 URL 파라미터 생성
      const params = new URLSearchParams();
      if (input.hospitalName)  params.set("hospitalName", input.hospitalName);
      if (input.packageId)     params.set("pkg", input.packageId);
      if (input.contactName)   params.set("contact", input.contactName);
      if (input.email)         params.set("email", input.email);
      if (input.phone)         params.set("phone", input.phone);
      if (input.shootDate)     params.set("shootDate", input.shootDate);
      if (input.profileCount)  params.set("profileCount", String(input.profileCount));
      if (input.stagedCount)   params.set("stagedCount", String(input.stagedCount));
      if (input.floorCount)    params.set("floorCount", String(input.floorCount));
      if (input.largeHospital) params.set("large", "1");
      if (input.droneCount)    params.set("droneCount", String(input.droneCount));
      if (input.memo)          params.set("memo", input.memo);
      return {
        action: "navigate",
        url: `https://photoclinic-quote.vercel.app/photoclinic?${params.toString()}`,
        message: `${input.hospitalName} 견적서 페이지를 열었어요!`,
      };
    }

    case "send_file_transfer": {
      // 파일 전송 메일 API 호출
      const origin = req.headers.get("origin") || "https://photoclinic-ai.vercel.app";
      const res = await fetch(`${origin}/api/send-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      return {
        action: "done",
        message: `${input.hospitalName} 파일 전송 메일을 ${input.toEmail}로 발송했어요!`,
      };
    }

    case "create_conti": {
      const params = new URLSearchParams();
      Object.entries(input).forEach(([k, v]) => {
        if (v) params.set(k, String(v));
      });
      return {
        action: "navigate",
        url: `/conti?${params.toString()}`,
        message: `${input.hospitalName} 콘티 페이지를 열었어요!`,
      };
    }

    case "open_page": {
      return {
        action: "navigate",
        url: `/${input.page}`,
        message: `페이지로 이동할게요!`,
      };
    }

    default:
      return { action: "done", message: "완료됐어요!" };
  }
}
