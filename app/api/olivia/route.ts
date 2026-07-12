import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logActivity } from "@/lib/activityLogger";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Claude tool 형식 ──────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_quote",
    description: "Create a quote for hospital photography. Opens the quote page with pre-filled data.",
    input_schema: {
      type: "object",
      properties: {
        hospitalName:  { type: "string",  description: "Hospital or client name" },
        packageId:     { type: "string",  description: "Package: standard | premium | premium-plus-1 | premium-plus-2" },
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
  {
    name: "send_file_transfer",
    description: "Send a file delivery email with NAS link to client.",
    input_schema: {
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
  {
    name: "create_conti",
    description: "Create a shooting plan/conti document for a hospital.",
    input_schema: {
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
  {
    name: "create_contract",
    description: "Create a contract from an approved quote.",
    input_schema: {
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
  {
    name: "create_website",
    description: "Start the hospital website creation workflow.",
    input_schema: {
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
  {
    name: "open_page",
    description: "Navigate to a specific page.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: ["calendar", "quote", "conti", "contract", "delivery-mail", "diagnosis", "channel-analyzer",
                 "instagram-promo-design", "photo-sorting", "website-builder",
                 "photo-retouching", "image-generator", "clients", "mailing", "gallery",
                 "review-studio", "daily-ideas", "sns-manager", "youtube-planner", "ai-trust-gap", "assets", "report",
                 "monthly-report", "subscription", "workflow", "workflow-tasks",
                 "workflow-approvals", "workflow-templates", "workflow-logs", "memo"],
        },
      },
      required: ["page"],
    },
  },
  {
    name: "calendar_add",
    description: "캘린더에 새 할일/일정을 추가합니다. '오늘', '내일' 등은 오늘 날짜 기준으로 YYYY-MM-DD로 변환하세요. 구체적인 날짜/시간이 없는 일반 메모는 이 도구 대신 memo_add를 사용하세요.",
    input_schema: {
      type: "object",
      properties: {
        date:     { type: "string",  description: "날짜 YYYY-MM-DD" },
        title:    { type: "string",  description: "할일 제목" },
        time:     { type: "string",  description: "시간 HH:MM 24시간제 (선택)" },
        location: { type: "string",  description: "장소 (선택)" },
        category: { type: "string",  enum: ["shooting","client","admin","personal","general"], description: "촬영|고객미팅|행정|개인|기타" },
        memo:     { type: "string",  description: "메모 (선택)" },
      },
      required: ["date", "title"],
    },
  },
  {
    name: "memo_add",
    description: "구체적인 날짜/시간이 없는 일반 메모나 상담 내용을 저장합니다. 사용자가 '메모해줘', '기록해줘', '저장해줘'라고 했지만 특정 일정(날짜/시간)이 없으면 calendar_add 대신 이 도구를 사용하세요. 오늘 날짜로 지레짐작해서 캘린더에 넣지 마세요.",
    input_schema: {
      type: "object",
      properties: {
        rawMemo:            { type: "string", description: "메모 원문 또는 정리된 내용" },
        hospitalName:       { type: "string", description: "관련 병원명 (선택, 알고 있으면 채울 것)" },
        summary:            { type: "string", description: "1~2문장 요약 (선택)" },
        nextAction:         { type: "string", description: "다음 액션 (선택, 예: 견적서 전달)" },
        recommendedPackage: { type: "string", description: "추천 패키지 (선택)" },
      },
      required: ["rawMemo"],
    },
  },
  {
    name: "calendar_list",
    description: "특정 날짜의 캘린더 할일 목록을 조회합니다. 결과에 ID가 포함되어 완료/삭제 시 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "날짜 YYYY-MM-DD" },
      },
      required: ["date"],
    },
  },
  {
    name: "calendar_complete",
    description: "캘린더 할일을 완료 또는 미완료로 변경합니다. ID를 모르면 date와 matchTitle을 함께 사용해 가장 가까운 일정을 찾습니다.",
    input_schema: {
      type: "object",
      properties: {
        id:        { type: "string",  description: "태스크 ID (calendar_list 결과에서 확인)" },
        date:      { type: "string",  description: "ID가 없을 때 검색할 날짜 YYYY-MM-DD" },
        matchTitle:{ type: "string",  description: "ID가 없을 때 찾을 일정 제목 일부" },
        completed: { type: "boolean", description: "true=완료, false=미완료" },
      },
      required: [],
    },
  },
  {
    name: "calendar_delete",
    description: "캘린더 할일을 삭제합니다. ID를 모르면 date와 matchTitle을 함께 사용해 가장 가까운 일정을 찾습니다.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "태스크 ID (calendar_list 결과에서 확인)" },
        date: { type: "string", description: "ID가 없을 때 검색할 날짜 YYYY-MM-DD" },
        matchTitle: { type: "string", description: "ID가 없을 때 찾을 일정 제목 일부" },
      },
      required: [],
    },
  },
  {
    name: "calendar_update",
    description: "캘린더 할일/일정을 수정합니다. ID를 모르면 date와 matchTitle을 함께 사용해 가장 가까운 일정을 찾습니다.",
    input_schema: {
      type: "object",
      properties: {
        id:        { type: "string", description: "태스크 ID" },
        date:      { type: "string", description: "ID가 없을 때 검색할 기존 날짜 YYYY-MM-DD" },
        matchTitle:{ type: "string", description: "ID가 없을 때 찾을 기존 일정 제목 일부" },
        newDate:   { type: "string", description: "변경할 날짜 YYYY-MM-DD" },
        title:     { type: "string", description: "변경할 제목" },
        time:      { type: "string", description: "변경할 시간 HH:MM" },
        location:  { type: "string", description: "변경할 장소" },
        category:  { type: "string", enum: ["shooting","client","admin","personal","general"], description: "변경할 카테고리" },
        memo:      { type: "string", description: "변경할 메모" },
        completed: { type: "boolean", description: "완료 여부 변경" },
      },
      required: [],
    },
  },
  {
    name: "send_workflow_mail",
    description: "워크플로우 메일 발송 — 후기 요청, 원본 전달, 갤러리 공유 등 병원 고객에게 단계별 메일을 보냅니다. 병원명으로 DB에서 이메일을 자동 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        hospitalName: { type: "string", description: "병원명 (DB에서 이메일 자동 조회)" },
        mailType: {
          type: "string",
          enum: ["review_form", "original_files", "gallery", "quote", "contract", "conti", "proposal"],
          description: "메일 종류: review_form=후기요청, original_files=원본파일전달, gallery=갤러리공유, quote=견적, contract=계약, conti=콘티, proposal=제안",
        },
        customBody: { type: "string", description: "메일 본문 추가 메시지 (선택)" },
      },
      required: ["hospitalName", "mailType"],
    },
  },
  {
    name: "get_workflow_status",
    description: "고객의 워크플로우 현재 단계와 다음 액션을 확인합니다. '~병원 현황 알려줘', '~병원 지금 어디까지 했어?' 등의 요청에 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "병원명 (일부만 입력해도 됩니다)" },
      },
      required: ["clientName"],
    },
  },
  {
    name: "advance_workflow_step",
    description: "고객 워크플로우의 현재 단계를 완료하고 다음 단계로 진행합니다. '다음 단계로 넘겨줘', '콘티 단계로 이동해줘' 등의 요청에 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "병원명" },
        toStepKey:  { type: "string", description: "이동할 단계 key (예: contract, conti, shooting, original_delivery, final_delivery, review_content)" },
      },
      required: ["clientName", "toStepKey"],
    },
  },
  {
    name: "list_mailing_queue",
    description: "메일링 큐의 대기 중인 메일 목록을 확인합니다. '보낼 메일 있어?', '메일 대기 목록 알려줘' 등에 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "특정 병원 필터 (선택)" },
        status:     { type: "string", enum: ["draft", "ready", "sent", "failed"], description: "상태 필터 (선택, 기본: draft+ready)" },
      },
    },
  },
  {
    name: "send_mailing",
    description: "메일링 큐의 특정 메일을 발송합니다. list_mailing_queue로 ID를 확인한 후 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        mailingId: { type: "string", description: "mailing_queue 테이블의 메일 ID" },
      },
      required: ["mailingId"],
    },
  },
  {
    name: "get_gallery",
    description: "병원의 납품 갤러리와 NAS 링크를 조회합니다. '~병원 갤러리 링크 알려줘', '~병원 사진 전달 링크' 요청에 사용합니다.",
    input_schema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "병원명" },
      },
      required: ["clientName"],
    },
  },
  {
    name: "create_gallery",
    description: "보정 완료 후 갤러리를 등록하고 메일 초안을 자동 생성합니다. NAS 링크를 포함해 갤러리를 생성하며, client_id가 있으면 mailing_queue draft 자동 생성 + 워크플로우 final_delivery 단계로 자동 전진합니다.",
    input_schema: {
      type: "object",
      properties: {
        clientName:   { type: "string", description: "병원명" },
        nasLink:      { type: "string", description: "NAS 공유 링크" },
        thumbnailUrl: { type: "string", description: "대표 이미지 URL (선택)" },
        description:  { type: "string", description: "촬영 내용 메모 (선택)" },
        shootDate:    { type: "string", description: "촬영 날짜 YYYY-MM-DD (선택)" },
      },
      required: ["clientName", "nasLink"],
    },
  },
  {
    name: "calendar_add_bulk",
    description: "캘린더에 여러 할일/일정을 한번에 추가합니다. 2개 이상의 일정을 추가할 때는 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "추가할 일정 목록",
          items: {
            type: "object",
            properties: {
              date:     { type: "string", description: "날짜 YYYY-MM-DD" },
              title:    { type: "string", description: "할일 제목" },
              time:     { type: "string", description: "시간 또는 시간범위 (예: 10:00 또는 10:00~13:00)" },
              location: { type: "string", description: "장소 (선택)" },
              category: { type: "string", enum: ["shooting","client","admin","personal","general"] },
              memo:     { type: "string", description: "메모 (선택)" },
            },
            required: ["date", "title"],
          },
        },
      },
      required: ["tasks"],
    },
  },
];

// ── Anthropic 내장 웹 검색 도구 ───────────────────────────────
const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name: "web_search",
  type: "web_search_20250305" as any,
} as any;

const TODAY = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.\s*/g, "-").replace(/-$/, "");

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const parseKoreanDate = (text: string) => {
  const today = new Date(`${TODAY}T00:00:00+09:00`);
  if (/모레/.test(text)) return formatDate(addDays(today, 2));
  if (/내일/.test(text)) return formatDate(addDays(today, 1));
  if (/어제/.test(text)) return formatDate(addDays(today, -1));
  if (/오늘|금일|지금/.test(text)) return formatDate(today);

  const iso = text.match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) return `${today.getFullYear()}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;

  const weekdays: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  const weekday = text.match(/(이번\s*주|다음\s*주|다다음\s*주)?\s*([월화수목금토일])요일/);
  if (weekday) {
    const target = weekdays[weekday[2]];
    const current = today.getDay();
    const base = weekday[1]?.includes("다다음") ? 14 : weekday[1]?.includes("다음") ? 7 : 0;
    let diff = target - current + base;
    if (diff < 0) diff += 7;
    return formatDate(addDays(today, diff));
  }

  return "";
};

const parseKoreanTime = (text: string) => {
  const match = text.match(/(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (!match) return "";
  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const inferCategory = (text: string) => {
  if (/촬영|스튜디오|프로필|영상|콘텐츠/.test(text)) return "shooting";
  if (/미팅|상담|회의|클라이언트|병원|원장|실장/.test(text)) return "client";
  if (/정산|계약|견적|세금|입금|청구|관리/.test(text)) return "admin";
  if (/개인\s*(일정|약속|용무)|개인적으로/.test(text)) return "personal";
  return "general";
};

const parseLocation = (text: string): string => {
  // "장소는 XXX", "위치는 XXX", "장소: XXX"
  const m1 = text.match(/(?:장소|위치)\s*[는은:]\s*([^,，。\n]+)/);
  if (m1) return m1[1].trim();
  // "XXX에서" 패턴 — 2~6 글자 명사구
  const m2 = text.match(/([가-힣a-zA-Z0-9\s]{2,12})\s*에서\b/);
  if (m2) return m2[1].trim();
  return "";
};

const cleanCalendarTitle = (text: string) =>
  text
    // ① 장소/위치 표현 전체 제거 ("장소는 XXX", "XXX에서")
    .replace(/(?:장소|위치)\s*[는은:]\s*[^,，。\n]*/g, "")
    .replace(/(?:[가-힣a-zA-Z0-9]{1,8}\s+)?[가-힣a-zA-Z0-9]{1,8}\s*에서\b/g, "")
    // ② 공백 포함 요청 동사 복합 패턴 (먼저 제거해야 함)
    //    "등록 해 줘", "추가 해 줄래", "해 주세요", "해 줬으면" 등
    .replace(/(?:추가|등록|넣어|잡아|예약|메모|기록|저장|삭제|지워|취소|수정|변경|바꿔|옮겨|완료|조회)\s*해\s*(?:줘|줄래|주세요|주면|줬으면|줄\s*수\s*있어|줄게|드려)/g, "")
    .replace(/해\s*(?:줘|줄래|주세요|주면|줬으면|줄\s*수\s*있어|줄게|드려)/g, "")
    .replace(/부탁\s*(?:드려|해|드립니다)?/g, "")
    .replace(/주\s*세\s*요/g, "")
    // ③ 캘린더/할일 키워드
    .replace(/(캘린더|일정|할일|업무)/g, "")
    // ④ 동사+줘 복합 (잡아줘, 넣어줘 등 — 해 없이 바로 줘)
    .replace(/(?:추가|등록|넣어|잡아|예약|메모|기록|저장|삭제|지워|취소|수정|변경|바꿔|옮겨|완료|조회)\s*줘/g, "")
    // ⑤ 단독 동사
    .replace(/(추가|등록|넣어|잡아|메모|기록|저장|해줘|해줄래|완료|삭제|지워|취소|수정|변경|바꿔|옮겨|조회|보여줘|알려줘)/g, "")
    // ⑥ 잔여 줘/줄래 단독 처리
    .replace(/\s+(?:줘|줄래)\b/g, "")
    // ⑤ 날짜 표현
    .replace(/(오늘|내일|모레|어제|금일|이번\s*주|다음\s*주|다다음\s*주|[월화수목금토일]요일)/g, "")
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, "")
    // ⑥ 시간 표현
    .replace(/(오전|오후)?\s*\d{1,2}\s*시\s*\d{1,2}\s*분/g, "")
    .replace(/(오전|오후)?\s*\d{1,2}\s*시/g, "")
    // ⑦ 남은 구두점 정리
    .replace(/[,，、。]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function calendarShortcutFromText(text: string) {
  const isCalendarText = /(캘린더|일정|할일|메모|기록|저장|촬영|미팅|상담|회의|모임|약속)/.test(text);
  if (!isCalendarText) return null;

  const date = parseKoreanDate(text);
  const time = parseKoreanTime(text);
  const location = parseLocation(text);
  const title = cleanCalendarTitle(text);

  const makeTool = (name: string, input: Record<string, unknown>) => ({
    ok: true,
    type: "tool_request",
    text: "",
    tool: { name, input, id: `shortcut_${Date.now()}` },
  });

  if (/(보여|조회|목록|뭐\s*있|알려)/.test(text)) {
    return date ? makeTool("calendar_list", { date }) : null;
  }

  // "추가/등록"을 먼저 체크 — "취소 일정 등록해줘" 같이 두 키워드가 동시에 있을 때 추가 의도 우선
  if (/(추가|등록|넣어|잡아|예약|메모|기록|저장)/.test(text)) {
    // 날짜/시간이나 일정성 키워드(미팅/상담/회의 등)가 전혀 없는 순수 "메모해줘" 류 요청은
    // 오늘 날짜로 지레짐작해 캘린더에 넣지 않는다. Claude가 memo_add 도구로 직접 판단하도록
    // shortcut을 건너뛰고 전체 tool-use 턴으로 넘긴다.
    const hasScheduleSignal = !!date || !!time || /(미팅|상담|회의|모임|약속|촬영|일정|캘린더|할일)/.test(text);
    if (!hasScheduleSignal && /(메모|기록|저장)/.test(text)) {
      return null;
    }

    // 한 문장에 일정이 여러 건 섞여 있으면(예: "A 추가, B 넣어줘") 이 shortcut은
    // 시간/제목을 하나로만 뽑아서 뭉개버리므로 bail out — Claude의 tool-use 턴이
    // calendar_add_bulk로 각 일정을 따로 처리하도록 넘긴다.
    const timeMatches = text.match(/(오전|오후)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?/g) || [];
    const actionVerbMatches = text.match(/(추가|등록|넣어|잡아|예약)/g) || [];
    if (timeMatches.length >= 2 || actionVerbMatches.length >= 2) {
      return null;
    }

    const resolvedDate = date || formatDate(new Date(`${TODAY}T00:00:00+09:00`));
    if (!title) {
      return { ok: true, type: "message", text: "어떤 일정 제목으로 추가할까요? 예: 내일 오후 3시 포토클리닉 미팅 추가해줘" };
    }
    return makeTool("calendar_add", {
      date: resolvedDate,
      title,
      time: time || undefined,
      location: location || undefined,
      category: inferCategory(text),
      memo: text,
    });
  }

  if (/(삭제|지워|취소)/.test(text)) {
    return date && title ? makeTool("calendar_delete", { date, matchTitle: title }) : null;
  }

  if (/(완료|끝냈|처리)/.test(text)) {
    return date && title ? makeTool("calendar_complete", { date, matchTitle: title, completed: true }) : null;
  }

  if (/(수정|변경|바꿔|옮겨|미뤄|앞당겨)/.test(text)) {
    return date && title ? makeTool("calendar_update", { date, matchTitle: title, time: time || undefined }) : null;
  }

  return null;
}

function pageShortcutFromText(text: string) {
  if (!/(열어|이동|가줘|보여|페이지|앱|기능)/.test(text)) return null;

  const pages: Array<[RegExp, string]> = [
    [/캘린더|일정|할일/, "calendar"],
    [/견적|견적서/, "quote"],
    [/콘티|촬영\s*계획/, "conti"],
    [/계약|계약서/, "contract"],
    [/파일\s*전송|납품\s*메일|전달\s*메일/, "delivery-mail"],
    [/고객|클라이언트|병원\s*관리/, "clients"],
    [/메일링|메일\s*큐|통합\s*메일/, "mailing"],
    [/갤러리|사진\s*전달/, "gallery"],
    [/리뷰|후기/, "review-studio"],
    [/아이디어|오늘\s*콘텐츠/, "daily-ideas"],
    [/AI\s*추천|트러스트\s*갭|trust\s*gap|역분석|추천\s*병원/, "ai-trust-gap"],
    [/유튜브|youtube|쇼츠|영상\s*기획|콘텐츠\s*기획/, "youtube-planner"],
    [/SNS|인스타|콘텐츠\s*제작/, "sns-manager"],
    [/자산|보관함|콘텐츠\s*자산/, "assets"],
    [/리포트|보고서|통계/, "report"],
    [/월간\s*리포트/, "monthly-report"],
    [/이미지\s*진단|병원\s*진단/, "diagnosis"],
    [/채널\s*분석|인스타\s*분석/, "channel-analyzer"],
    [/홈페이지|웹사이트/, "website-builder"],
    [/이미지\s*생성|디렉터|AI\s*이미지/, "image-generator"],
    [/사진\s*분류/, "photo-sorting"],
    [/사진\s*보정|보정/, "photo-retouching"],
    [/메모/, "memo"],
    [/워크플로우|업무\s*흐름|작업\s*큐|승인\s*대기|승인함|에이전트\s*작업/, "workflow"],
  ];

  const found = pages.find(([pattern]) => pattern.test(text));
  if (!found) return null;

  return {
    ok: true,
    type: "tool_request",
    text: "",
    tool: {
      name: "open_page",
      input: { page: found[1] },
      id: `shortcut_${Date.now()}`,
    },
  };
}

const SYSTEM = `You are Olivia, the AI assistant of PhotoClinic (a hospital branding photography studio in Korea).
You help the studio owner Jeong Yeon-ho (Jung Yeonho) with daily tasks.
오늘 날짜: ${TODAY} (한국 시간 기준, '오늘'/'내일'/'이번주 금요일' 등을 YYYY-MM-DD로 변환할 때 사용)

Available tools:
- create_quote: Generate a photography quote
- send_file_transfer: Send files via email to clients
- create_conti: Create a shooting plan
- create_contract: Generate a contract from an approved quote
- create_website: Start hospital website creation workflow
- open_page: Navigate to a page (calendar, clients, mailing, gallery, review-studio, workflow 등 앱 이동)
- web_search: Search the web for real-time information (병원 트렌드, 경쟁 분석, 최신 정보 등)
- calendar_add: 캘린더에 할일/일정 추가 (단건)
- calendar_add_bulk: 여러 일정을 한번에 추가 (2개 이상 반드시 사용)
- calendar_list: 특정 날짜의 할일 목록 조회 (ID 포함)
- calendar_complete: 할일 완료/미완료 처리
- calendar_delete: 할일 삭제
- calendar_update: 할일 제목/날짜/시간/장소/메모 수정
- memo_add: 날짜/시간이 없는 일반 메모·상담 내용 저장 (캘린더 아님)
- send_workflow_mail: 병원 고객에게 워크플로우 메일 발송 (후기 요청, 원본 전달, 갤러리 공유 등)
- get_workflow_status: 고객 워크플로우 현재 단계 및 다음 액션 확인
- advance_workflow_step: 워크플로우 단계 진행 (예: quote → contract, contract → conti)
- list_mailing_queue: 메일 대기 목록 조회 (draft/ready 상태)
- send_mailing: 대기 중인 특정 메일 즉시 발송
- get_gallery: 병원의 납품 갤러리·NAS 링크 조회
- create_gallery: 보정 완료 후 갤러리 등록 (client_id 연동 시 메일 draft 자동 생성 + 워크플로우 자동 전진)

워크플로우 규칙 (매우 중요):
- "~병원 현황 알려줘", "~병원 지금 어디까지?" → get_workflow_status 호출
- "다음 단계로", "~단계로 넘겨줘" → 먼저 get_workflow_status로 현재 단계 확인 후 advance_workflow_step 호출
- "메일 있어?", "대기 메일 알려줘" → list_mailing_queue 호출 → 사용자 확인 → send_mailing
- "갤러리 링크 알려줘", "~병원 NAS 링크", "갤러리 어디야?" → get_gallery 호출
- "갤러리 등록", "NAS 링크 올려줘", "보정 완료" → create_gallery 호출 (client_id 있으면 워크플로우 자동 전진)
- 워크플로우 단계 key: consult_meeting → quote → contract → conti → shooting → backup_sorting → original_delivery → client_selection → raw_matching → retouching → revision → seo_delivery → final_delivery → review_content → reward → customer_care → content_planning
- advance_workflow_step 호출 전 반드시 사용자에게 "X단계에서 Y단계로 이동합니다. 맞나요?" 확인할 것

워크플로우 메일 사용 규칙:
- "후기 메일", "후기 요청 메일", "리뷰 메일" → mailType: review_form
- "원본 전달", "원본 파일 메일" → mailType: original_files
- "갤러리 공유", "갤러리 메일" → mailType: gallery
- "견적 메일" → mailType: quote
- "계약 메일" → mailType: contract
- "콘티 메일" → mailType: conti
- "제안서 메일" → mailType: proposal
- 병원명만 말해도 DB에서 이메일 자동 조회 — 따로 묻지 말 것
- 메일이 성공하면 발송 완료 메시지, 이메일 없으면 등록 필요 안내

캘린더 도구 사용 규칙:
- 날짜 표현('오늘', '내일', '다음주 월요일' 등)은 반드시 위의 오늘 날짜 기준으로 YYYY-MM-DD로 변환할 것
- 시간은 24시간제 HH:MM 형식 (예: 오후 3시 → 15:00, 범위는 10:00~13:00)
- 카테고리: shooting=촬영, client=고객/미팅, admin=행정, personal=개인, general=기타
- 2개 이상 일정 추가 시 calendar_add를 여러 번 호출하지 말고 calendar_add_bulk 하나로 처리할 것
- calendar_delete/complete/update는 ID를 알고 있으면 ID를 사용하고, ID를 모르면 date와 matchTitle을 넣어 도구가 일정을 찾게 할 것
- "추가해줘", "등록해줘", "캘린더에 넣어줘", "일정 잡아줘"는 calendar_add 또는 calendar_add_bulk를 사용 (날짜/시간이 없는 순수 메모는 아래 규칙 참고)
- "수정해줘", "바꿔줘", "변경해줘", "옮겨줘", "시간 바꿔줘"는 calendar_update를 사용
- "삭제해줘", "지워줘", "취소해줘"는 calendar_delete를 사용
- "완료했어", "완료 처리해줘"는 calendar_complete를 사용

캘린더 title/location 파싱 규칙 (매우 중요):
- title은 모임/행사/할일의 이름만 담을 것. 아래 표현은 절대 title에 포함하지 말 것:
  · 동작 표현: "등록해줘", "추가해줘", "넣어줘", "잡아줘", "기록해줘", "메모해줘", "저장해줘"
  · 장소 표현: "장소는", "위치는", "장소:", "위치:", "에서"
  · 날짜/시간 표현: "내일", "오늘", "오전", "오후", "시", "분" 등
- "장소는 XXX", "위치는 XXX", "장소: XXX", "XXX에서" → location 필드에 XXX를 저장할 것
- 파싱 예시:
  · "내일 오전 10시, OO모임 등록해줘, 장소는 강남역" → title:"OO모임", time:"10:00", location:"강남역"
  · "다음주 화요일 오후 2시 병원 미팅, 장소는 서울대병원" → title:"병원 미팅", time:"14:00", location:"서울대병원"
  · "오늘 3시 촬영 일정 잡아줘, 스튜디오 A에서" → title:"촬영", time:"15:00", location:"스튜디오 A"
  · "내일 오전 10시 김철수 대표 미팅, 강남구청 근처 카페" → title:"김철수 대표 미팅", time:"10:00", location:"강남구청 근처 카페"

메모 vs 캘린더 판단 규칙 (매우 중요 — 짐작하지 말고 아래 기준으로 직접 판단할 것):
- 사용자가 "메모해줘", "기록해줘", "저장해줘" 등을 말하면, 날짜/시간이 있는지로 도구를 선택할 것:
  · 구체적인 날짜나 시간이 있는 일정/미팅/상담 (예: "오늘 11시 미팅 메모해줘", "내일 촬영 기록해줘") → calendar_add 사용, 전달받은 내용(주제·논의 사항·후속 액션)을 요약해서 memo 필드에 담을 것
  · 날짜/시간이 전혀 없는 일반 메모나 상담 요약 (예: "메모해줘: 클라이언트가 파란 배경 원함") → memo_add 사용. 오늘 날짜로 지레짐작해서 캘린더에 넣지 말 것
- 여러 건의 후속 일정이 언급된 경우(예: "다음 주 촬영") calendar_add_bulk로 한번에 추가
- 사용자가 일정 조회만 원하는 것이 아니라 저장을 원하는 경우, calendar_list를 먼저 호출하지 말고 바로 calendar_add 또는 memo_add로 저장할 것
- memo_add 사용 시 병원 상담 내용이면 가능한 한 hospitalName·summary·nextAction을 채워 상담 이력이 명확히 남도록 할 것
- 예시(날짜 언급 없음): "허태경 대표님 미팅 - AI 기능 전환, 플랫폼 논의" → memo_add(rawMemo="허태경 대표님 미팅 - AI 기능 전환, 플랫폼 논의", summary="AI 기능 전환 및 플랫폼 방향성 논의")
- 예시(날짜 있음): "오늘 11시 허태경 대표님 미팅 메모해줘 - AI 기능 전환 논의" → calendar_add(date=오늘, time="11:00", title="허태경 대표님 미팅", category="client", memo="AI 기능 전환 논의")

Rules:
1. Always respond in Korean (hangul).
2. Be friendly and concise.
3. Ask for missing info naturally before using a tool.
4. 사용자의 요청이 앱 기능 실행/입력/수정/삭제/조회라면 반드시 적절한 tool_use를 반환해라. UI가 승인 카드 또는 자동 실행을 처리한다.
5. 기능 실행이 필요한데 필수 정보가 부족하면 한 번만 짧게 물어봐라. 이미 충분하면 말로 설명만 하지 말고 tool_use를 사용해라.

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  const body = await req.json();
  const { messages, pendingTool, pageContext, imageBase64, imageMime } = body;

  // 도구 실행 요청
  if (pendingTool) {
    try {
      await logActivity("olivia_chat", undefined, { tool: pendingTool.name });
      const result = await executeTool(pendingTool.name, pendingTool.input, req);
      return NextResponse.json({ ok: true, toolResult: result });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? "도구 실행 중 오류가 발생했어요." }, { status: 200 });
    }
  }

  const lastUserText = [...(messages || [])].reverse().find((m: any) => m.role === "user")?.content || "";
  const calendarShortcut = typeof lastUserText === "string" ? calendarShortcutFromText(lastUserText) : null;
  if (calendarShortcut) {
    return NextResponse.json(calendarShortcut);
  }
  const pageShortcut = typeof lastUserText === "string" ? pageShortcutFromText(lastUserText) : null;
  if (pageShortcut) {
    return NextResponse.json(pageShortcut);
  }

  // 시스템 프롬프트에 페이지 컨텍스트 추가
  const systemWithContext = pageContext
    ? `${SYSTEM}\n\n현재 사용자가 보고 있는 화면: ${pageContext}\n이 컨텍스트를 참고하여 더 정확하게 도움을 주세요.`
    : SYSTEM;

  // OpenAI 형식 → Anthropic 형식 변환
  const anthropicMessages: Anthropic.MessageParam[] = (messages || [])
    .filter((m: any) => m.role === "user" || m.role === "assistant")
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // 이미지가 첨부된 경우 마지막 user 메시지를 멀티모달 content로 변환
  if (imageBase64 && anthropicMessages.length > 0) {
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last.role === "user") {
      last.content = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: (imageMime || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: typeof last.content === "string" ? last.content : "",
        },
      ];
    }
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemWithContext,
    tools: [...TOOLS, WEB_SEARCH_TOOL],
    messages: anthropicMessages,
  });

  // 모든 text 블록 수집 (웹 검색 결과 포함)
  const allText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n\n");

  // 커스텀 tool_use 블록만 확인 (web_search 제외)
  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name !== "web_search"
  );

  if (toolUseBlock) {
    return NextResponse.json({
      ok: true,
      type: "tool_request",
      text: allText,
      tool: {
        name: toolUseBlock.name,
        input: toolUseBlock.input,
        id: toolUseBlock.id,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    type: "message",
    text: allText || "",
  });
}

async function listCalendarTasks(date: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("calendar_tasks")
    .select("*")
    .eq("date", date)
    .order("time", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function addCalendarTask(input: any) {
  const db = getSupabaseAdmin();
  const base = {
    date: input.date,
    title: input.title,
    memo: input.memo ?? "",
    category: input.category ?? "general",
    completed: false,
  };

  let { data, error } = await db
    .from("calendar_tasks")
    .insert({ ...base, time: input.time ?? null, location: input.location ?? null })
    .select("id")
    .single();

  if (error && (error.message.includes("column") || error.code === "42703")) {
    ({ data, error } = await db.from("calendar_tasks").insert(base).select("id").single());
  }

  if (error) throw new Error(error.message);
  return data?.id;
}

async function updateCalendarTask(input: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { id, ...fields } = input;
  if (!id) throw new Error("수정할 일정 ID가 없습니다.");

  let { error } = await db
    .from("calendar_tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error && (error.message.includes("column") || error.code === "42703")) {
    const fallback = { ...fields };
    delete fallback.time;
    delete fallback.location;
    ({ error } = await db
      .from("calendar_tasks")
      .update({ ...fallback, updated_at: new Date().toISOString() })
      .eq("id", id));
  }

  if (error) throw new Error(error.message);
}

async function deleteCalendarTask(id: string) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("calendar_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function resolveCalendarTaskId(input: any) {
  if (input.id) return input.id;
  if (!input.date || !input.matchTitle) {
    throw new Error("수정/삭제/완료할 일정의 ID 또는 날짜+제목 일부가 필요합니다.");
  }

  const tasks: any[] = await listCalendarTasks(input.date);
  const keyword = String(input.matchTitle).trim().toLowerCase();
  const found = tasks.find((task) => String(task.title || "").toLowerCase().includes(keyword));
  if (!found) {
    const list = tasks.map((task, index) => `${index + 1}. ${task.title} (${task.id})`).join("\n");
    throw new Error(`${input.date}에서 "${input.matchTitle}" 일정을 찾지 못했어요.${list ? "\n\n가능한 일정:\n" + list : ""}`);
  }

  return found.id;
}

async function executeTool(name: string, input: any, req: NextRequest) {
  if (name === "create_quote") {
    await logActivity("create_quote", input.hospitalName, { package: input.packageId });
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
      message: input.hospitalName + " 견적서 페이지를 열었어요!",
    };
  }

  if (name === "send_file_transfer") {
    await logActivity("send_file", input.hospitalName, { email: input.toEmail });
    const origin =
    req.headers.get("x-base-url") ||
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
    const r = await fetch(origin + "/api/send-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error);
    return {
      action: "done",
      message: input.hospitalName + " 파일 전송 메일을 " + input.toEmail + "로 발송했어요!",
    };
  }

  if (name === "create_conti") {
    await logActivity("create_conti", input.hospitalName, { dept: input.dept });
    const params = new URLSearchParams();
    Object.entries(input).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    return {
      action: "navigate",
      url: "/conti?" + params.toString(),
      message: input.hospitalName + " 콘티 페이지를 열었어요!",
    };
  }

  if (name === "create_contract") {
    await logActivity("create_contract", input.hospitalName, { amount: input.totalAmount });
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
    await logActivity("create_website", input.hospitalName, { specialties: input.specialties });
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
      message: `${input.hospitalName} 홈페이지 제작 페이지를 열었어요! 🌐`,
    };
  }

  if (name === "open_page") {
    const pageMap: Record<string, string> = {
      workflow: "/workflow",
      "workflow-tasks": "/workflow/tasks",
      "workflow-approvals": "/workflow/approvals",
      "workflow-templates": "/workflow/templates",
      "workflow-logs": "/workflow/logs",
      "youtube-planner": "/sns-manager?tab=youtube",
      "ai-trust-gap": "/ai-trust-gap",
    };

    return {
      action: "navigate",
      url: pageMap[input.page] || "/" + input.page,
      message: "페이지로 이동할게요!",
    };
  }

  if (name === "calendar_add") {
    await logActivity("calendar_add", input.title, { date: input.date, category: input.category });
    await addCalendarTask({
      date:     input.date,
      title:    input.title,
      memo:     input.memo     ?? "",
      category: input.category ?? "general",
      time:     input.time     ?? null,
      location: input.location ?? null,
    });
    const timeStr     = input.time     ? ` · ${input.time}` : "";
    const locationStr = input.location ? ` 📍${input.location}` : "";
    return {
      action: "done",
      message: `📅 "${input.title}"을(를) ${input.date}${timeStr}${locationStr}에 추가했어요!`,
    };
  }

  if (name === "memo_add") {
    const db = getSupabaseAdmin();
    let hospitalId: string | null = null;
    let hospitalLabel = input.hospitalName || "";
    if (input.hospitalName) {
      const { data: clients } = await db
        .from("clients")
        .select("id, hospital_name")
        .ilike("hospital_name", `%${input.hospitalName}%`)
        .limit(1);
      if (clients?.[0]) { hospitalId = clients[0].id; hospitalLabel = clients[0].hospital_name; }
    }

    await logActivity("create_memo", hospitalLabel || undefined, { summary: input.summary });
    await db.from("consultation_memos").insert({
      hospital_id: hospitalId,
      raw_memo: input.rawMemo,
      summary: input.summary || "",
      extracted_data: {},
      recommended_package: input.recommendedPackage || "",
      next_action: input.nextAction || "",
    });

    return {
      action: "done",
      message: `📝 메모를 저장했어요${hospitalLabel ? ` (${hospitalLabel})` : ""}.${input.nextAction ? `\n다음 액션: ${input.nextAction}` : ""}`,
    };
  }

  if (name === "calendar_list") {
    const tasks: any[] = await listCalendarTasks(input.date);
    if (tasks.length === 0) {
      return { action: "done", message: `📅 ${input.date}에 등록된 할일이 없어요.` };
    }
    const CATLABEL: Record<string, string> = { shooting:"촬영", client:"고객/미팅", admin:"행정", personal:"개인", general:"기타" };
    const lines = tasks.map((t, i) => {
      const done  = t.completed ? "✅" : "⬜";
      const time  = t.time     ? ` ${t.time}` : "";
      const loc   = t.location ? ` 📍${t.location}` : "";
      const cat   = CATLABEL[t.category] ?? t.category;
      return `${done} ${i+1}. [${cat}] ${t.title}${time}${loc}\n   ID: ${t.id}`;
    });
    return {
      action: "done",
      message: `📅 **${input.date} 할일 목록** (총 ${tasks.length}개)\n\n${lines.join("\n\n")}`,
    };
  }

  if (name === "calendar_complete") {
    const id = await resolveCalendarTaskId(input);
    await updateCalendarTask({ id, completed: input.completed ?? true });
    return {
      action: "done",
      message: input.completed === false ? "↩️ 할일을 미완료로 되돌렸어요!" : "✅ 할일을 완료 처리했어요!",
    };
  }

  if (name === "calendar_delete") {
    const id = await resolveCalendarTaskId(input);
    await deleteCalendarTask(id);
    return { action: "done", message: "🗑️ 할일을 삭제했어요!" };
  }

  if (name === "calendar_update") {
    const id = await resolveCalendarTaskId(input);
    const patch: Record<string, unknown> = { id };
    if (input.newDate) patch.date = input.newDate;
    if (input.title) patch.title = input.title;
    if (input.time !== undefined) patch.time = input.time || null;
    if (input.location !== undefined) patch.location = input.location || null;
    if (input.category) patch.category = input.category;
    if (input.memo !== undefined) patch.memo = input.memo || "";
    if (input.completed !== undefined) patch.completed = Boolean(input.completed);

    await updateCalendarTask(patch);

    const changed = [
      input.newDate ? `날짜 ${input.newDate}` : "",
      input.time !== undefined ? `시간 ${input.time || "없음"}` : "",
      input.location !== undefined ? `장소 ${input.location || "없음"}` : "",
      input.title ? `제목 "${input.title}"` : "",
    ].filter(Boolean).join(" · ");
    return { action: "done", message: `✏️ 일정을 수정했어요.${changed ? "\n" + changed : ""}` };
  }

  if (name === "calendar_add_bulk") {
    await logActivity("calendar_add", "bulk", { count: input.tasks?.length });
    const tasks: any[] = input.tasks ?? [];
    const results: string[] = [];
    let success = 0;
    for (const task of tasks) {
      // time 범위(10:00~13:00)는 HH:MM 부분만 추출해서 저장
      const timeVal = task.time ? task.time.split("~")[0].trim() : null;
      const timeLabel = task.time ? ` ${task.time}` : "";
      try {
        await addCalendarTask({
          date:     task.date,
          title:    task.title,
          memo:     task.memo     ?? "",
          category: task.category ?? "shooting",
          time:     timeVal,
          location: task.location ?? null,
        });
        success++;
        results.push(`✅ ${task.date}${timeLabel} ${task.title}`);
      } catch (error) {
        results.push(`❌ ${task.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      action: "done",
      message: `📅 **${success}/${tasks.length}개 일정 추가 완료!**\n\n${results.join("\n")}`,
    };
  }

  if (name === "get_workflow_status") {
    const db = getSupabaseAdmin();
    const { data: runs } = await db
      .from("workflow_runs")
      .select("id, client_name, current_step_key, status, updated_at, next_action")
      .eq("status", "active")
      .ilike("client_name", `%${input.clientName}%`)
      .order("updated_at", { ascending: false })
      .limit(1);
    const run = runs?.[0];
    if (!run) {
      return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.\n/clients 에서 워크플로우를 시작해주세요.` };
    }
    const STEP_LABELS: Record<string, string> = {
      consult_meeting: "1. 상담/미팅", quote: "2. 견적서", contract: "3. 계약서", conti: "4. 콘티",
      shooting: "5. 촬영", backup_sorting: "6. 백업/분류", original_delivery: "7. 원본 전달",
      client_selection: "8. 고객 셀렉", raw_matching: "9. RAW 매칭", retouching: "10. 보정",
      revision: "11. 수정 접수", seo_delivery: "12. SEO 납품", final_delivery: "13. 최종 전달",
      review_content: "14. 후기 콘텐츠", reward: "15. 리워드", customer_care: "16. 고객 케어", content_planning: "17. 콘텐츠 기획",
    };
    const step = STEP_LABELS[run.current_step_key] ?? run.current_step_key;
    const updated = new Date(run.updated_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    return {
      action: "done",
      message: `📋 **${run.client_name}** 워크플로우 현황\n\n**현재 단계:** ${step}\n**마지막 업데이트:** ${updated}\n\n다음 단계로 진행하려면 "다음 단계로 넘겨줘" 또는 "XX단계로 이동해줘"라고 말씀해주세요.`,
    };
  }

  if (name === "advance_workflow_step") {
    const db = getSupabaseAdmin();
    const { data: runs } = await db
      .from("workflow_runs")
      .select("id, client_name, current_step_key")
      .eq("status", "active")
      .ilike("client_name", `%${input.clientName}%`)
      .order("updated_at", { ascending: false })
      .limit(1);
    const run = runs?.[0];
    if (!run) {
      return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
    }
    const origin =
      req.headers.get("x-base-url") || req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const res = await fetch(`${origin}/api/workflow/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: run.id, to_step_key: input.toStepKey, reason: "올리비아 요청" }),
    });
    const d = await res.json();
    if (!d.ok) return { action: "done", message: `❌ 단계 이동 실패: ${d.error}` };
    await logActivity("advance_workflow_step", run.client_name, { from: run.current_step_key, to: input.toStepKey });
    return {
      action: "done",
      message: `✅ **${run.client_name}** 워크플로우를 **${input.toStepKey}** 단계로 이동했어요!\n\n/clients 에서 다음 할 일을 확인해주세요.`,
    };
  }

  if (name === "list_mailing_queue") {
    const db = getSupabaseAdmin();
    let query = db.from("mailing_queue")
      .select("id, type, hospital_name, subject, status, to_email, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (input.status) {
      query = query.eq("status", input.status);
    } else {
      query = query.in("status", ["draft", "ready"]);
    }
    if (input.clientName) query = query.ilike("hospital_name", `%${input.clientName}%`);
    const { data: items } = await query;
    if (!items || items.length === 0) {
      return { action: "done", message: "📭 대기 중인 메일이 없습니다." };
    }
    const TYPE_KR: Record<string, string> = {
      quote: "견적서", contract: "계약서", conti: "콘티", original_files: "원본파일",
      gallery: "갤러리", review_form: "후기 요청", monthly_report: "리포트", proposal: "제안서",
    };
    const list = items.map((m: any, i: number) =>
      `${i + 1}. **${m.hospital_name}** — ${TYPE_KR[m.type] ?? m.type} (${m.status})\n   ID: \`${m.id}\`\n   수신: ${m.to_email || "미입력"}`
    ).join("\n\n");
    return {
      action: "done",
      message: `📬 **대기 중인 메일 ${items.length}건**\n\n${list}\n\n특정 메일을 발송하려면 ID를 알려주세요.`,
    };
  }

  if (name === "send_mailing") {
    const origin =
      req.headers.get("x-base-url") || req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const res = await fetch(`${origin}/api/mailing/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: input.mailingId }),
    });
    const d = await res.json();
    if (!d.ok) return { action: "done", message: `❌ 발송 실패: ${d.error}` };
    return { action: "done", message: `✅ 메일 발송 완료!\nID: \`${input.mailingId}\`` };
  }

  if (name === "get_gallery") {
    const db = getSupabaseAdmin();
    // 병원명으로 client_id 조회
    const { data: clients } = await db
      .from("clients")
      .select("id, hospital_name")
      .ilike("hospital_name", `%${input.clientName}%`)
      .limit(1);
    const client = clients?.[0];

    let query = db
      .from("photo_galleries")
      .select("id, hospital_name, nas_link, shoot_date, description, created_at, items:photo_gallery_items(thumbnail_url)")
      .order("created_at", { ascending: false })
      .limit(5);

    if (client?.id) query = query.eq("client_id", client.id);
    else query = query.ilike("hospital_name", `%${input.clientName}%`);

    const { data: galleries } = await query;

    if (!galleries || galleries.length === 0) {
      return { action: "done", message: `📷 **${input.clientName}** 갤러리가 아직 없습니다.\n\n갤러리를 등록하려면 create_gallery 도구를 사용해주세요.` };
    }

    const lines = galleries.map((g: any) => {
      const date = g.shoot_date ? new Date(g.shoot_date).toLocaleDateString("ko-KR") : "날짜 미입력";
      const desc = g.description ? ` — ${g.description}` : "";
      return `• [${date}${desc}]\n  NAS: ${g.nas_link}`;
    });

    return {
      action: "done",
      message: `📷 **${client?.hospital_name || input.clientName}** 갤러리 ${galleries.length}건\n\n${lines.join("\n\n")}`,
    };
  }

  if (name === "create_gallery") {
    const db = getSupabaseAdmin();
    const { data: clients } = await db
      .from("clients")
      .select("id, hospital_name, contact_name, email")
      .ilike("hospital_name", `%${input.clientName}%`)
      .limit(1);
    const client = clients?.[0];

    // 활성 워크플로우 조회 (자동 전진용)
    let run: { id: string; current_step_key: string } | undefined;
    if (client?.id) {
      const { data: runs } = await db
        .from("workflow_runs")
        .select("id, current_step_key")
        .eq("client_id", client.id)
        .eq("status", "active")
        .limit(1);
      run = (runs as { id: string; current_step_key: string }[] | null)?.[0];
    }

    const origin =
      req.headers.get("x-base-url") || req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";
    const res = await fetch(`${origin}/api/galleries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hospitalName:  client?.hospital_name || input.clientName,
        contactName:   client?.contact_name  || "",
        contactEmail:  client?.email         || "",
        nasLink:       input.nasLink,
        description:   input.description     || "",
        shootDate:     input.shootDate        || null,
        thumbnailUrl:  input.thumbnailUrl     || "",
        client_id:       client?.id          || null,
        workflow_run_id: run?.id             || null,
      }),
    });
    const d = await res.json();
    if (!d.ok) return { action: "done", message: `❌ 갤러리 생성 실패: ${d.error}` };
    await logActivity("send_workflow_mail", input.clientName, { gallery: true, nasLink: input.nasLink });

    const autoMsg = run?.current_step_key === "retouching"
      ? "\n\n✅ 보정완료 처리 + 메일 draft 자동 생성 + **final_delivery** 단계로 자동 전진됐어요."
      : "\n\n메일링함에 draft가 저장됐습니다.";

    return {
      action: "done",
      message: `📷 **${client?.hospital_name || input.clientName}** 갤러리 등록 완료!\nNAS: ${input.nasLink}${autoMsg}`,
    };
  }

  if (name === "send_workflow_mail") {
    const db = getSupabaseAdmin();

    // 병원명으로 clients 테이블에서 이메일 조회
    const { data: clients } = await db
      .from("clients")
      .select("id, hospital_name, contact_name, email")
      .ilike("hospital_name", `%${input.hospitalName}%`)
      .limit(1);

    const client = clients?.[0];
    const toEmail = client?.email;
    const contactName = client?.contact_name || "";
    const hospitalName = client?.hospital_name || input.hospitalName;

    // 메일 타입별 기본 제목/본문
    const MAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
      review_form: {
        subject: `[포토클리닉] ${hospitalName} 후기 작성 요청`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n포토클리닉 촬영 서비스를 이용해 주셔서 진심으로 감사드립니다.\n\n촬영 결과물이 마음에 드셨다면, 소중한 후기를 남겨주시면 큰 힘이 됩니다.\n후기는 저희 서비스 발전에 큰 도움이 됩니다.\n\n감사합니다.`,
      },
      original_files: {
        subject: `[포토클리닉] ${hospitalName} 원본 파일 전달`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n촬영 원본 파일을 전달드립니다.\n파일 수령 후 이상 여부를 확인해주시고, 문의사항이 있으시면 언제든지 연락 주세요.\n\n감사합니다.`,
      },
      gallery: {
        subject: `[포토클리닉] ${hospitalName} 갤러리 공유`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n촬영 결과물 갤러리 링크를 공유드립니다.\n확인하신 후 선택 또는 피드백을 주시면 감사하겠습니다.\n\n감사합니다.`,
      },
      quote: {
        subject: `[포토클리닉] ${hospitalName} 견적서 안내`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n포토클리닉 촬영 견적서를 보내드립니다.\n검토하신 후 궁금하신 사항이 있으시면 언제든지 문의해 주세요.\n\n감사합니다.`,
      },
      contract: {
        subject: `[포토클리닉] ${hospitalName} 계약서 안내`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n계약서를 첨부드립니다.\n내용 검토 후 서명하여 회신해 주시면 감사하겠습니다.\n\n감사합니다.`,
      },
      conti: {
        subject: `[포토클리닉] ${hospitalName} 콘티/촬영 계획서 안내`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n촬영 계획서(콘티)를 공유드립니다.\n확인 후 수정사항이 있으시면 알려주세요.\n\n감사합니다.`,
      },
      proposal: {
        subject: `[포토클리닉] ${hospitalName} 제안서 안내`,
        body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n포토클리닉 브랜드 촬영 제안서를 보내드립니다.\n검토하신 후 편하게 연락 주세요.\n\n감사합니다.`,
      },
    };

    const template = MAIL_TEMPLATES[input.mailType] ?? {
      subject: `[포토클리닉] ${hospitalName} 안내`,
      body: `안녕하세요${contactName ? ", " + contactName + " 담당자님" : ""}.\n\n포토클리닉입니다. 확인 부탁드립니다.\n\n감사합니다.`,
    };

    const body = input.customBody
      ? template.body + "\n\n" + input.customBody
      : template.body;

    if (!toEmail) {
      // 이메일 없으면 draft로 저장
      const { data: inserted } = await db
        .from("mailing_queue")
        .insert({
          type:          input.mailType,
          hospital_name: hospitalName,
          contact_name:  contactName,
          subject:       template.subject,
          body,
          status:        "draft",
          links:         [],
          attachments:   [],
        })
        .select("id")
        .single();

      return {
        action: "done",
        message: `⚠️ **${hospitalName}**의 이메일이 등록되어 있지 않아요.\n\n메일 초안을 저장했어요 (ID: ${inserted?.id ?? "?"}).\n고객 정보에서 이메일을 등록하면 메일링 페이지에서 발송할 수 있어요.`,
      };
    }

    // mailing_queue에 INSERT
    const { data: inserted, error: insertErr } = await db
      .from("mailing_queue")
      .insert({
        type:          input.mailType,
        hospital_name: hospitalName,
        contact_name:  contactName,
        to_email:      toEmail,
        subject:       template.subject,
        body,
        status:        "pending",
        links:         [],
        attachments:   [],
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      throw new Error(`메일 큐 생성 실패: ${insertErr?.message ?? "알 수 없는 오류"}`);
    }

    // 실제 발송
    const origin =
      req.headers.get("x-base-url") ||
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";

    const sendRes = await fetch(origin + "/api/mailing/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inserted.id }),
    });
    const sendData = await sendRes.json();

    if (!sendData.ok) {
      return {
        action: "done",
        message: `⚠️ **${hospitalName}** 메일 발송 실패\n수신: ${toEmail}\n오류: ${sendData.error}`,
      };
    }

    await logActivity("send_workflow_mail", hospitalName, { mailType: input.mailType, toEmail });

    return {
      action: "done",
      message: `✅ **${hospitalName}** ${input.mailType === "review_form" ? "후기 요청" : input.mailType === "original_files" ? "원본 전달" : input.mailType === "gallery" ? "갤러리 공유" : input.mailType} 메일을 **${toEmail}**으로 발송했어요!`,
    };
  }

  return { action: "done", message: "완료됐어요!" };
}
