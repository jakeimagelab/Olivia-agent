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
                 "review-studio", "daily-ideas", "sns-manager", "assets", "report",
                 "monthly-report", "subscription", "workflow", "workflow-tasks",
                 "workflow-approvals", "workflow-templates", "workflow-logs", "memo"],
        },
      },
      required: ["page"],
    },
  },
  {
    name: "calendar_add",
    description: "캘린더에 새 할일/일정을 추가합니다. '오늘', '내일' 등은 오늘 날짜 기준으로 YYYY-MM-DD로 변환하세요.",
    input_schema: {
      type: "object",
      properties: {
        date:     { type: "string",  description: "날짜 YYYY-MM-DD" },
        title:    { type: "string",  description: "할일 제목" },
        time:     { type: "string",  description: "시간 HH:MM 24시간제 (선택)" },
        location: { type: "string",  description: "장소 (선택)" },
        category: { type: "string",  enum: ["shooting","client","admin","general"], description: "촬영|고객미팅|행정|기타" },
        memo:     { type: "string",  description: "메모 (선택)" },
      },
      required: ["date", "title"],
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
        category:  { type: "string", enum: ["shooting","client","admin","general"], description: "변경할 카테고리" },
        memo:      { type: "string", description: "변경할 메모" },
        completed: { type: "boolean", description: "완료 여부 변경" },
      },
      required: [],
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
              category: { type: "string", enum: ["shooting","client","admin","general"] },
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
  return "general";
};

const parseLocation = (text: string): string => {
  // "장소는 XXX", "위치는 XXX", "장소: XXX", "위치: XXX"
  const m = text.match(/(?:장소|위치)\s*[는은:]\s*([^,，。\n]+)/);
  if (m) return m[1].trim();
  return "";
};

const cleanCalendarTitle = (text: string) =>
  text
    // 장소/위치 표현 전체 제거 (값 포함)
    .replace(/(?:장소|위치)\s*[는은:]\s*[^,，。\n]*/g, "")
    .replace(/(캘린더|일정|할일|업무)/g, "")
    .replace(/(추가|등록|넣어|잡아|메모|기록|저장|해줘|해줄래|부탁|완료|삭제|지워|취소|수정|변경|바꿔|옮겨|조회|보여줘|알려줘)/g, "")
    .replace(/(오늘|내일|모레|어제|금일|이번\s*주|다음\s*주|다다음\s*주|[월화수목금토일]요일)/g, "")
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, "")
    .replace(/(오전|오후)?\s*\d{1,2}\s*시(\s*\d{1,2}\s*분)?/g, "")
    // 남은 쉼표/구두점 정리
    .replace(/[,，、]+/g, " ")
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

캘린더 도구 사용 규칙:
- 날짜 표현('오늘', '내일', '다음주 월요일' 등)은 반드시 위의 오늘 날짜 기준으로 YYYY-MM-DD로 변환할 것
- 시간은 24시간제 HH:MM 형식 (예: 오후 3시 → 15:00, 범위는 10:00~13:00)
- 카테고리: shooting=촬영, client=고객/미팅, admin=행정, general=기타
- 2개 이상 일정 추가 시 calendar_add를 여러 번 호출하지 말고 calendar_add_bulk 하나로 처리할 것
- calendar_delete/complete/update는 ID를 알고 있으면 ID를 사용하고, ID를 모르면 date와 matchTitle을 넣어 도구가 일정을 찾게 할 것
- "추가해줘", "등록해줘", "캘린더에 넣어줘", "일정 잡아줘", "메모해줘", "기록해줘"는 calendar_add 또는 calendar_add_bulk를 사용
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

미팅/상담 메모 처리 규칙 (매우 중요):
- 사용자가 "메모해줘", "기록해줘", "저장해줘", "메모해줄래" 등을 포함한 미팅/상담 내용을 전달하면, 반드시 calendar_add를 사용해 해당 날짜에 일정+메모를 저장할 것
- 메모에는 전달받은 내용(주제, 논의 사항, 후속 액션 등)을 요약해서 memo 필드에 담을 것
- 여러 건의 후속 일정이 언급된 경우(예: "다음 주 촬영") calendar_add_bulk로 한번에 추가
- 사용자가 일정 조회만 원하는 것이 아니라 메모 저장을 원하는 경우, calendar_list를 먼저 호출하지 말고 바로 calendar_add로 저장할 것
- 예시: "허태경 대표님 미팅 - AI 기능 전환, 플랫폼 논의" → calendar_add(date=오늘, title="허태경 대표님 미팅", category="client", memo="AI 기능 전환 및 플랫폼 방향성 논의")

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
    await logActivity("olivia_chat", undefined, { tool: pendingTool.name });
    const result = await executeTool(pendingTool.name, pendingTool.input, req);
    return NextResponse.json({ ok: true, toolResult: result });
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

  if (name === "calendar_list") {
    const tasks: any[] = await listCalendarTasks(input.date);
    if (tasks.length === 0) {
      return { action: "done", message: `📅 ${input.date}에 등록된 할일이 없어요.` };
    }
    const CATLABEL: Record<string, string> = { shooting:"촬영", client:"고객/미팅", admin:"행정", general:"기타" };
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

  return { action: "done", message: "완료됐어요!" };
}
