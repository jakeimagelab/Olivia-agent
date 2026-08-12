import type { OliviaV2Message } from "@/lib/olivia/v2/types";

export type OliviaExchange = {
  id: string;
  userMessageId: string;
  userText: string;
  assistantText: string;
  createdAt: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
};

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
