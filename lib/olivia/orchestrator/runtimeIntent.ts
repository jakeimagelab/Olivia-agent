import type { OliviaRuntimeContext } from "@/lib/olivia/runtime/types";
import { resolveTemporalExpression } from "@/lib/olivia/runtime/temporalResolver";
import { weekdayKoForDate } from "@/lib/olivia/runtime/buildRuntimeContext";

// "일정/캘린더/미팅" 등이 섞여 있으면 "오늘 무슨 일정 있어?"처럼 실제로는 데이터 조회 요청이라
// 직답하지 않고 GPT+캘린더 도구로 넘긴다 — 이 레이어는 순수하게 "오늘이 며칠/무슨 요일/몇 시"를
// 묻는 질문만 담당한다.
const SCHEDULE_HINT = /(일정|캘린더|스케줄|미팅|약속|촬영|회의|예약)/;
const DATE_ASK = /(며칠|날짜)/;
const WEEKDAY_ASK = /요일/;
const TIME_ASK = /(몇\s*시|지금\s*시간|시간\s*이\s*몇)/;

// 날짜/요일/시각을 GPT의 추측이 아니라 코드가 직접 계산해서 답한다(설계 문서 7절). null을
// 반환하면 이 메시지는 런타임 질문이 아니라는 뜻 — 호출부가 GPT로 넘긴다.
export function answerRuntimeQuery(message: string, runtime: OliviaRuntimeContext): string | null {
  const t = message.trim();
  if (!t || SCHEDULE_HINT.test(t)) return null;

  const wantsDate = DATE_ASK.test(t);
  const wantsWeekday = WEEKDAY_ASK.test(t);
  const wantsTime = TIME_ASK.test(t);
  if (!wantsDate && !wantsWeekday && !wantsTime) return null;

  const temporal = resolveTemporalExpression(t, runtime);

  // "몇 시"는 "지금" 기준일 때만 직답한다 — 다른 날짜와 결합되면(의미가 불분명) GPT로 넘긴다.
  if (wantsTime && !wantsDate && !wantsWeekday) {
    if (temporal && temporal.kind === "date" && temporal.date !== runtime.todayISO) return null;
    return `지금은 ${runtime.localTime}이에요 (한국 시간 기준).`;
  }

  const targetDate = temporal && temporal.kind === "date" ? temporal.date : runtime.todayISO;
  const label = temporal && temporal.kind === "date" ? temporal.label : "오늘";
  const weekday = targetDate === runtime.todayISO ? runtime.weekdayKo : weekdayKoForDate(targetDate);
  const [y, m, d] = targetDate.split("-").map(Number);

  if (wantsDate && wantsWeekday) return `${label}은 ${y}년 ${m}월 ${d}일 ${weekday}이에요.`;
  if (wantsDate) return `${label}은 ${y}년 ${m}월 ${d}일이에요.`;
  if (wantsWeekday) return `${label}은 ${weekday}이에요.`;
  return null;
}
