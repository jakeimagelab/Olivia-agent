const CRITICAL_KEYWORDS = ["컴플레인", "취소", "오류", "긴급"];
const HIGH_KEYWORDS = [
  "계약",
  "입금",
  "결제",
  "견적",
  "세금계산서",
  "촬영",
  "수정",
  "변경",
  "마감",
];

export function classifyImportantEmail(input: {
  subject: string;
  snippet?: string;
}): "CRITICAL" | "HIGH" | null {
  const text = `${input.subject} ${input.snippet ?? ""}`.toLowerCase();
  if (CRITICAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "CRITICAL";
  }
  if (HIGH_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "HIGH";
  }
  return null;
}
