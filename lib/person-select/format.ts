/** Browser-safe formatting helpers shared by the person-select admin UI. */
export function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}
