export type PastedCalendarTask = {
  date: string;
  title: string;
  memo: string;
  category: "shooting" | "client" | "admin" | "personal" | "general";
  completed: false;
  time: string | null;
  end_time: string | null;
  location: null;
  reminder_enabled: false;
  reminder_minutes_before: 30;
};

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromClipboard(text: string, fallbackDate: string) {
  const fallback = new Date(`${fallbackDate}T12:00:00`);
  const relative = text.match(/(오늘|내일|모레)/);
  if (relative) {
    const offset = relative[1] === "내일" ? 1 : relative[1] === "모레" ? 2 : 0;
    fallback.setDate(fallback.getDate() + offset);
    return { date: toYmd(fallback), token: relative[0] };
  }

  const full = text.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (full) return { date: `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`, token: full[0] };

  const monthDay = text.match(/\b(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*일?/);
  if (monthDay) return { date: `${fallback.getFullYear()}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`, token: monthDay[0] };

  return { date: fallbackDate, token: "" };
}

function timeFromClipboard(text: string) {
  const match = text.match(/(오전|오후)?\s*(\d{1,2})(?::|시\s*)(\d{1,2})?\s*분?/);
  if (!match) return { time: null, token: "" };

  let hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  if (match[1] === "오후" && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { time: null, token: "" };
  return { time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, token: match[0] };
}

function endTime(start: string | null) {
  if (!start) return null;
  const [hour, minute] = start.split(":").map(Number);
  const total = Math.min(hour * 60 + minute + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function parseClipboardTasks(raw: string, fallbackDate: string): PastedCalendarTask[] {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const datePart = dateFromClipboard(line, fallbackDate);
    const timePart = timeFromClipboard(line);
    const title = line
      .replace(datePart.token, "")
      .replace(timePart.token, "")
      .replace(/^[\s|,;:\-–—·]+|[\s|,;:\-–—·]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!title) return [];

    const category = /촬영|콘티/.test(title) ? "shooting"
      : /상담|미팅|고객|병원/.test(title) ? "client"
      : /계약|정산|세금|행정/.test(title) ? "admin"
      : /개인|가족/.test(title) ? "personal" : "general";

    return [{
      date: datePart.date,
      title,
      memo: "",
      category,
      completed: false,
      time: timePart.time,
      end_time: endTime(timePart.time),
      location: null,
      reminder_enabled: false,
      reminder_minutes_before: 30,
    } satisfies PastedCalendarTask];
  });
}
