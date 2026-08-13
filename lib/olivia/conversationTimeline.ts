import type { OliviaV2Message } from "@/lib/olivia/v2/types";

export type OliviaTopicKey =
  | "quote" | "contract" | "conti" | "diagnosis" | "briefing" | "meeting"
  | "gallery" | "mailing" | "email" | "calendar" | "workflow" | "general";

export type OliviaExchange = {
  id: string;
  userMessageId: string;
  userText: string;
  assistantText: string;
  createdAt: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  topicKey: OliviaTopicKey;
  topicLabel: string;
  topicChanged: boolean;
  previousTopicLabel?: string;
};

const TOPIC_LABELS: Record<OliviaTopicKey, string> = {
  quote: "견적 이야기",
  contract: "계약 이야기",
  conti: "콘티 이야기",
  diagnosis: "진단 이야기",
  briefing: "브리핑 이야기",
  meeting: "미팅 이야기",
  gallery: "갤러리 이야기",
  mailing: "메일링 이야기",
  email: "이메일 이야기",
  calendar: "일정 이야기",
  workflow: "진행 현황 이야기",
  general: "일반 대화",
};

// 순서가 우선순위 — 더 구체적인 도메인(견적/계약/콘티 등)을 먼저 매칭하고,
// 일정·진행상황처럼 다른 도메인 이야기에도 흔히 섞여 나오는 광범위한 키워드는 뒤로 둔다.
const TOPIC_PATTERNS: Array<[OliviaTopicKey, RegExp]> = [
  ["quote", /견적/],
  ["contract", /계약/],
  ["conti", /콘티/],
  ["diagnosis", /진단|브랜드\s*분석|채널\s*분석/],
  ["briefing", /브리핑|긴급\s*인사이트/],
  ["meeting", /미팅|회의|상담(?!원)/],
  ["gallery", /갤러리|셀렉\s*갤러리|사진\s*분류/],
  ["mailing", /메일링|메일\s*발송|메일\s*큐/],
  ["email", /이메일|지메일|메일함|메일\s*답장|메일\s*초안/],
  ["calendar", /일정|캘린더|스케줄/],
  ["workflow", /워크플로우|진행\s*상황|진행\s*중|다음\s*단계|프로젝트\s*현황/],
];

export function classifyOliviaTopic(text: string): OliviaTopicKey {
  for (const [key, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) return key;
  }
  return "general";
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function validDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function compactText(value: string, max = 54) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

export function buildConversationExchanges(messages: OliviaV2Message[]): OliviaExchange[] {
  const exchanges: OliviaExchange[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const user = messages[index];
    if (user.role !== "user") continue;
    const assistant = messages.slice(index + 1).find((message) => message.role === "assistant");
    const created = validDate(user.createdAt);
    const key = dateKey(created);
    exchanges.push({
      id: `exchange:${user.id}`,
      userMessageId: user.id,
      userText: compactText(user.content || "메시지"),
      assistantText: compactText(assistant?.content || "Olivia가 답변을 준비하고 있어요.", 110),
      createdAt: created.toISOString(),
      dateKey: key,
      dateLabel: key === dateKey(new Date()) ? "오늘" : dateFormatter.format(created),
      timeLabel: timeFormatter.format(created),
    });
  }
  return exchanges;
}

export function groupExchangesByDate(exchanges: OliviaExchange[]) {
  const groups: Array<{ dateKey: string; dateLabel: string; exchanges: OliviaExchange[] }> = [];
  for (const exchange of exchanges) {
    const current = groups.at(-1);
    if (current?.dateKey === exchange.dateKey) current.exchanges.push(exchange);
    else groups.push({ dateKey: exchange.dateKey, dateLabel: exchange.dateLabel, exchanges: [exchange] });
  }
  return groups;
}

export function chooseConversationMessages(cached: OliviaV2Message[], server: OliviaV2Message[]) {
  if (!cached.length) return server;
  if (!server.length) return cached;
  const cachedLast = validDate(cached.at(-1)?.createdAt).getTime();
  const serverLast = validDate(server.at(-1)?.createdAt).getTime();
  return cached.length >= server.length && cachedLast >= serverLast ? cached : server;
}
