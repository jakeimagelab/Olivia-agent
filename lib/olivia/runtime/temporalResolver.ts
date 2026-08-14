import type { OliviaRuntimeContext, TemporalResolution } from "./types";

// 날짜 산술은 전부 UTC 정오 기준으로 한다 — 자정 근처에서 setDate 연산 중 로컬 타임존 때문에
// 하루가 밀리는 사고를 피하기 위해서다(한국은 DST가 없어 정오 고정 산술로도 달력 날짜가 어긋나지
// 않는다). "내일"/"다음 주 월요일" 같은 표현을 GPT의 산수에 맡기지 않고 여기서 절대 날짜로
// 확정한 뒤 프롬프트/도구 입력에 그대로 꽂아 넣는 게 이 파일의 목적이다.
function toUtcNoon(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00Z`);
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function addDays(dateISO: string, days: number): string {
  const d = toUtcNoon(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
function addMonths(dateISO: string, months: number): string {
  const d = toUtcNoon(dateISO);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISO(d);
}
function weekdayIndex(dateISO: string): number {
  return toUtcNoon(dateISO).getUTCDay(); // 0=일 .. 6=토
}
function monthRange(dateISO: string): { start: string; end: string } {
  const d = toUtcNoon(dateISO);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const end = toISO(new Date(Date.UTC(y, m + 1, 0, 12)));
  return { start, end };
}
// 월요일 시작 주간 범위.
function weekMonday(dateISO: string): string {
  const idx = weekdayIndex(dateISO);
  const offset = idx === 0 ? -6 : 1 - idx;
  return addDays(dateISO, offset);
}
function weekRange(dateISO: string): { start: string; end: string } {
  const start = weekMonday(dateISO);
  return { start, end: addDays(start, 6) };
}
function setDay(dateISO: string, day: number): string {
  const d = toUtcNoon(dateISO);
  d.setUTCDate(day);
  return toISO(d);
}

const WEEKDAY_TOKEN: Record<string, number> = {
  일요일: 0, 일: 0, 월요일: 1, 월: 1, 화요일: 2, 화: 2, 수요일: 3, 수: 3,
  목요일: 4, 목: 4, 금요일: 5, 금: 5, 토요일: 6, 토: 6,
};
const WEEKDAY_LABEL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function dateInWeek(weekStart: string, weekdayIdx: number): string {
  const offset = weekdayIdx === 0 ? 6 : weekdayIdx - 1; // 월요일(1)=0 ... 일요일(0)=6
  return addDays(weekStart, offset);
}

const WEEKDAY_GROUP = "일요일|월요일|화요일|수요일|목요일|금요일|토요일|일|월|화|수|목|금|토";

// 지원 표현(최소 목록, 설계 문서 6절): 오늘/내일/모레/어제, 이번주/다음주/지난주(+요일),
// 이번달/다음달/지난달, "8월 20일", "20일", "다음 달 3일". 문장 전체가 아니라 부분 문자열
// 매칭이라 "내일 일정 보여줘"에서도 "내일" 토큰을 그대로 잡아낸다.
export function resolveTemporalExpression(text: string, runtime: OliviaRuntimeContext): TemporalResolution | null {
  const t = text.replace(/\s+/g, "");
  const today = runtime.todayISO;

  // 1) "다음주/이번주/지난주 + 요일"
  {
    const m = t.match(new RegExp(`(다음\\s*주|이번\\s*주|지난\\s*주)(${WEEKDAY_GROUP})`));
    if (m) {
      const weekOffset = m[1].startsWith("다음") ? 1 : m[1].startsWith("지난") ? -1 : 0;
      const base = addDays(weekMonday(today), weekOffset * 7);
      const weekdayIdx = WEEKDAY_TOKEN[m[2]];
      const date = dateInWeek(base, weekdayIdx);
      return { kind: "date", date, label: `${m[1]} ${WEEKDAY_LABEL[weekdayIdx]}` };
    }
  }

  // 2) "다음달/이번달/지난달 + N일"
  {
    const m = t.match(/(다음달|이번달|지난달)(\d{1,2})일/);
    if (m) {
      const monthOffset = m[1] === "다음달" ? 1 : m[1] === "지난달" ? -1 : 0;
      const base = addMonths(today, monthOffset);
      const date = setDay(base, Number(m[2]));
      return { kind: "date", date, label: `${m[1]} ${m[2]}일` };
    }
  }

  // 3) "M월 D일" (올해 기준)
  {
    const m = t.match(/(\d{1,2})월(\d{1,2})일/);
    if (m) {
      const d = toUtcNoon(today);
      const date = toISO(new Date(Date.UTC(d.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), 12)));
      return { kind: "date", date, label: `${m[1]}월 ${m[2]}일` };
    }
  }

  // 4) "다음주/이번주/지난주" (요일 없이 범위)
  {
    const m = t.match(/(다음주|이번주|지난주)/);
    if (m) {
      const weekOffset = m[1] === "다음주" ? 1 : m[1] === "지난주" ? -1 : 0;
      const start = addDays(weekMonday(today), weekOffset * 7);
      const end = addDays(start, 6);
      return { kind: "range", start, end, label: m[1] };
    }
  }

  // 5) "다음달/이번달/지난달" (범위)
  {
    const m = t.match(/(다음달|이번달|지난달)/);
    if (m) {
      const monthOffset = m[1] === "다음달" ? 1 : m[1] === "지난달" ? -1 : 0;
      const base = addMonths(today, monthOffset);
      const { start, end } = monthRange(base);
      return { kind: "range", start, end, label: m[1] };
    }
  }

  // 6) 모레/내일/어제/오늘 (모레를 내일보다 먼저 검사 — "모레"엔 "내일"이 없어 순서 상관없지만
  // 명시적으로 구체적인 표현을 먼저 둔다)
  if (t.includes("모레")) return { kind: "date", date: addDays(today, 2), label: "모레" };
  if (t.includes("내일")) return { kind: "date", date: addDays(today, 1), label: "내일" };
  if (t.includes("어제")) return { kind: "date", date: addDays(today, -1), label: "어제" };
  if (t.includes("오늘")) return { kind: "date", date: today, label: "오늘" };

  // 7) 순수 "N일" (이번 달 기준, 이미 지난 날짜면 다음 달로 — calendar_add의 기존 관례와 동일)
  {
    const m = t.match(/(\d{1,2})일/);
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) {
        let date = setDay(today, day);
        if (date < today) date = setDay(addMonths(today, 1), day);
        return { kind: "date", date, label: `${day}일` };
      }
    }
  }

  return null;
}
