import type { OliviaRuntimeContext } from "./types";

const TIMEZONE = "Asia/Seoul" as const;

const WEEKDAY_SHORT_TO_KO: Record<string, string> = {
  Sun: "일요일", Mon: "월요일", Tue: "화요일", Wed: "수요일", Thu: "목요일", Fri: "금요일", Sat: "토요일",
};

// 서버가 어느 타임존(보통 UTC)에서 돌든 항상 한국 시간 기준 값을 만든다 — GPT가 "오늘이 며칠인지"를
// 학습 데이터에서 추측하게 두지 않고, 이 함수가 코드로 계산한 값이 유일한 진실이다.
// hourCycle: "h23"을 명시하지 않으면 en-US 로케일에서 자정을 "24"로 표기하는 ICU 구현이 있어
// hour가 "00"~"23" 범위를 벗어날 수 있다.
export function buildOliviaRuntimeContext(now: Date = new Date()): OliviaRuntimeContext {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value])) as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second" | "weekday", string
  >;

  const todayISO = `${parts.year}-${parts.month}-${parts.day}`;
  const localTime = `${parts.hour}:${parts.minute}`;

  return {
    nowISO: now.toISOString(),
    todayISO,
    localDateTime: `${todayISO}T${parts.hour}:${parts.minute}:${parts.second}+09:00`,
    localTime,
    weekdayKo: WEEKDAY_SHORT_TO_KO[parts.weekday] || parts.weekday,
    timezone: TIMEZONE,
  };
}

// "내일 무슨 요일이야?"처럼 오늘이 아닌 날짜의 요일을 물을 때 쓴다. dateISO는 이미 Asia/Seoul
// 기준으로 확정된 달력 날짜라 정오(UTC) 고정 산술로 요일을 뽑아도 어긋나지 않는다.
export function weekdayKoForDate(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  const idx = d.getUTCDay();
  const order = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return order[idx];
}
