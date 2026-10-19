const SEOUL_TIME_ZONE = "Asia/Seoul";

function partsForSeoul(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function dateFromSeoulValue(value: string | Date) {
  if (value instanceof Date) return value;
  const input = value.trim();
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? `${input}:00+09:00` : input);
}

/** datetime-local 입력값은 항상 서울 시각으로 해석해 timestamptz에 저장한다. */
export function parseSeoulDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(input)
    ? `${input}+09:00`
    : input;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** timestamptz 값을 관리자 datetime-local 입력용 서울 시각으로 바꾼다. */
export function formatSeoulDateTimeInput(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.trim())) return value.trim();
  const date = dateFromSeoulValue(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsForSeoul(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** 새 행사 기본 마감: 생성일(서울)에서 14일 뒤 18:00. */
export function defaultSeoulDeadlineInput(now = new Date()): string {
  const parts = partsForSeoul(now);
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 14));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T18:00`;
}

/** 초 단위 없이, 항상 서울 시간대의 관리자 표시 형식으로 출력한다. */
export function formatSeoulDeadline(value: string | Date): string {
  const date = dateFromSeoulValue(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
