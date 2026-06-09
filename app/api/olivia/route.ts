import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_quote",
      description: "Create a quote for hospital photography. Opens the quote page with pre-filled data.",
      parameters: {
        type: "object",
        properties: {
          hospitalName:  { type: "string",  description: "Hospital or client name" },
          packageId:     { type: "string",  description: "Package: premium | premium_plus | homepage | branding" },
          contactName:   { type: "string",  description: "Contact person name" },
          email:         { type: "string",  description: "Email address" },
          phone:         { type: "string",  description: "Phone number" },
          shootDate:     { type: "string",  description: "Shoot date YYYY-MM-DD" },
          profileCount:  { type: "number",  description: "Extra profile persons" },
          stagedCount:   { type: "number",  description: "Extra staged persons" },
          floorCount:    { type: "number",  description: "Extra interior floors" },
          largeHospital: { type: "boolean", description: "Hospital-grade scale" },
          droneCount:    { type: "number",  description: "Drone shoot count" },
          memo:          { type: "string",  description: "Memo" },
        },
        required: ["hospitalName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_file_transfer",
      description: "Send a file delivery email with NAS link to client.",
      parameters: {
        type: "object",
        properties: {
          hospitalName: { type: "string", description: "Client name" },
          toName:       { type: "string", description: "Recipient name" },
          toEmail:      { type: "string", description: "Recipient email" },
          nasLink:      { type: "string", description: "NAS download link" },
          shootDate:    { type: "string", description: "Shoot date" },
          packageName:  { type: "string", description: "Package name" },
          fileCount:    { type: "number", description: "File count" },
          message:      { type: "string", description: "Extra message" },
        },
        required: ["hospitalName", "toEmail", "nasLink"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_conti",
      description: "Create a shooting plan/conti document for a hospital.",
      parameters: {
        type: "object",
        properties: {
          hospitalName: { type: "string", description: "Hospital name" },
          dept:         { type: "string", description: "Medical department" },
          shootDate:    { type: "string", description: "Shoot date" },
          spaces:       { type: "string", description: "Space info" },
          doctors:      { type: "string", description: "Medical staff info" },
          extras:       { type: "string", description: "Extra requests" },
        },
        required: ["hospitalName", "dept", "shootDate", "spaces"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_contract",
      description: "Create a contract from an approved quote. Navigates to contract page with quote data.",
      parameters: {
        type: "object",
        properties: {
          hospitalName:  { type: "string",  description: "Hospital name" },
          contactName:   { type: "string",  description: "Contact name" },
          phone:         { type: "string",  description: "Phone" },
          email:         { type: "string",  description: "Email" },
          quoteNumber:   { type: "string",  description: "Quote number" },
          shootDate:     { type: "string",  description: "Shoot date" },
          totalAmount:   { type: "number",  description: "Total amount" },
          packageName:   { type: "string",  description: "Package name" },
          memo:          { type: "string",  description: "Memo" },
        },
        required: ["hospitalName", "totalAmount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_website",
      description: "Start the hospital website creation workflow. Opens the website builder with pre-filled hospital info.",
      parameters: {
        type: "object",
        properties: {
          hospitalName: { type: "string", description: "Hospital name" },
          doctorName:   { type: "string", description: "Doctor/director name" },
          specialties:  { type: "string", description: "Medical specialties" },
          phone:        { type: "string", description: "Phone number" },
          address:      { type: "string", description: "Address" },
          concept:      { type: "string", description: "Design concept/mood" },
          memo:         { type: "string", description: "Additional notes" },
        },
        required: ["hospitalName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_page",
      description: "Navigate to a specific page.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: ["quote", "conti", "delivery-mail", "diagnosis", "channel-analyzer", "instagram-promo-design", "photo-sorting", "website-builder", "photo-retouching", "image-generator"],
          },
        },
        required: ["page"],
      },
    },
  },
];

const SYSTEM = `You are Olivia, the AI assistant of PhotoClinic (a hospital branding photography studio in Korea).
You help the studio owner Jeong Yeon-ho (Jung Yeonho) with daily tasks.

Available tools:
- create_quote: Generate a photography quote
- send_file_transfer: Send files via email to clients
- create_conti: Create a shooting plan
- create_contract: Generate a contract from an approved quote
- create_website: Start hospital website creation workflow
- open_page: Navigate to a page

Rules:
1. Always respond in Korean (hangul).
2. Be friendly and concise.
3. Ask for missing info naturally before using a tool.
4. Before executing a tool, describe what you will do and wait for approval.
5. Do NOT call tools directly. Instead respond with a description so the UI can show an approval card.

콘티 수정 규칙 (매우 중요):
- 사용자가 현재 편집 중인 콘티 데이터([현재 편집 중인 콘티 데이터] 블록)가 컨텍스트에 있을 때, 콘티 수정 요청을 받으면 반드시 수정된 전체 콘티를 반환해야 한다.
- 수정 응답 맨 끝에 반드시 아래 형식으로 포함할 것 (태그 안은 반드시 유효한 JSON):
  <CONTI_UPDATE>{"conti":[...],"checklist":[...],"schedule":[...]}</CONTI_UPDATE>
- conti 배열의 각 항목 필드: category, duration, location, cameraAngle, keyword, description, personnel, notes, color(선택)
- checklist 배열의 각 항목 필드: number, category, item, notes
- schedule 배열의 각 항목 필드: time, activity, type, requirements, notes
- 수정하지 않은 행은 원본 그대로 유지할 것. 일부만 수정 요청이면 해당 행만 바꾸고 나머지는 그대로 복사.
- 태그 안의 JSON은 반드시 파싱 가능한 완전한 형태여야 한다.

Packages (use exact packageId):
- standard: 스탠다드 135만원 - 프로필 + 연출사진
- premium: 프리미엄 200만원 - 프로필 + 연출사진 + 인테리어
- premium-plus-1: 프리미엄 플러스1 360만원 - 프로필 + 연출사진 + 인테리어 + 포인트영상
- premium-plus-2: 프리미엄 플러스2 450만원 - 프로필 + 연출사진 + 인테리어 + 브랜드필름`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  const body = await req.json();
  const { messages, pendingTool, pageContext } = body;

  if (pendingTool) {
    const result = await executeTool(pendingTool.name, pendingTool.input, req);
    return NextResponse.json({ ok: true, toolResult: result });
  }

  // 페이지 컨텍스트가 있으면 시스템 프롬프트에 추가
  const systemWithContext = pageContext
    ? `${SYSTEM}\n\n현재 사용자가 보고 있는 화면: ${pageContext}\n이 컨텍스트를 참고하여 더 정확하게 도움을 주세요.`
    : SYSTEM;

  const openaiMessages = [
    { role: "system", content: systemWithContext },
    ...(messages || []),
  ];

  const payload = {
    model: "gpt-4o-mini",
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "auto",
    messages: openaiMessages,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();

  if (!rawText || rawText.trim() === "") {
    return NextResponse.json({ ok: false, error: "OpenAI no response" }, { status: 500 });
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Parse error: " + rawText.slice(0, 200) }, { status: 500 });
  }

  if (!res.ok) {
    const msg = data?.error?.message || "OpenAI error " + res.status;
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (data.error) {
    return NextResponse.json({ ok: false, error: data.error.message || JSON.stringify(data.error) }, { status: 500 });
  }

  const choice = data.choices?.[0];
  const msg = choice?.message;

  if (msg?.tool_calls?.length > 0) {
    const tc = msg.tool_calls[0];
    let input: any = {};
    try { input = JSON.parse(tc.function.arguments); } catch (e) {}
    return NextResponse.json({
      ok: true,
      type: "tool_request",
      text: msg.content || "",
      tool: { name: tc.function.name, input, id: tc.id },
    });
  }

  return NextResponse.json({
    ok: true,
    type: "message",
    text: msg?.content || "",
  });
}

async function executeTool(name: string, input: any, req: NextRequest) {
  if (name === "create_quote") {
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
      url: "/quote?" + params.toString(),
      message: input.hospitalName + " " + "견적서 페이지를 열었어요!",
    };
  }

  if (name === "send_file_transfer") {
    const origin = req.headers.get("origin") || "https://olivia-agent-smoky.vercel.app";
    const r = await fetch(origin + "/api/send-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error);
    return {
      action: "done",
      message: input.hospitalName + " " + "파일 전송 메일을 " + input.toEmail + "로 발송했어요!",
    };
  }

  if (name === "create_conti") {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    return {
      action: "navigate",
      url: "/conti?" + params.toString(),
      message: input.hospitalName + " " + "콘티 페이지를 열었어요!",
    };
  }

  if (name === "create_contract") {
    const params = new URLSearchParams();
    const data = {
      hospitalName:  input.hospitalName  || "",
      contactName:   input.contactName   || "",
      phone:         input.phone         || "",
      email:         input.email         || "",
      quoteNumber:   input.quoteNumber   || "",
      shootDate:     input.shootDate     || null,
      totalAmount:   input.totalAmount   || 0,
      depositAmount: Math.round((input.totalAmount || 0) * 0.5),
      balanceAmount: Math.round((input.totalAmount || 0) * 0.5),
      supplyAmount:  Math.round((input.totalAmount || 0) / 1.1),
      vat:           Math.round((input.totalAmount || 0) / 11),
      discountAmount: 0,
      items: [{ name: input.packageName || "촬영 패키지", qty: 1, unitPrice: input.totalAmount || 0, subtotal: input.totalAmount || 0, note: "" }],
      memos: input.memo || null,
    };
    params.set("data", encodeURIComponent(JSON.stringify(data)));
    return {
      action: "navigate",
      url: "/contract?" + params.toString(),
      message: input.hospitalName + " 계약서 페이지를 열었어요!",
    };
  }

  if (name === "create_website") {
    const params = new URLSearchParams();
    if (input.hospitalName) params.set("hospitalName", input.hospitalName);
    if (input.doctorName)   params.set("doctorName",   input.doctorName);
    if (input.specialties)  params.set("specialties",  input.specialties);
    if (input.phone)        params.set("phone",         input.phone);
    if (input.address)      params.set("address",       input.address);
    if (input.concept)      params.set("concept",       input.concept);
    if (input.memo)         params.set("memo",          input.memo);
    return {
      action: "navigate",
      url: "/website-builder?" + params.toString(),
      message: `${input.hospitalName} 홈페이지 제작 페이지를 열었어요! 순서대로 진행해주세요 🌐`,
    };
  }

  if (name === "open_page") {
    return {
      action: "navigate",
      url: "/" + input.page,
      message: "페이지로 이동할게요!",
    };
  }

  return { action: "done", message: "완료됐어요!" };
}
