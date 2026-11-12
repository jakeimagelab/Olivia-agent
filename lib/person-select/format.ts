/** Browser-safe formatting helpers shared by the person-select admin UI. */
export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatRelativeTime(value: string | null, now = Date.now()) {
  if (!value) return "—";
  const minutes = Math.max(1, Math.round((now - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전`;
  return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(-Math.round(minutes / 1_440), "day");
}
