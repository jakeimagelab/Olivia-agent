export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateHeaderLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday})`;
}

export function timeRangeLabel(time: string | null, endTime: string | null): string {
  if (!time) return "시간 미정";
  return endTime ? `${time} - ${endTime}` : time;
}
