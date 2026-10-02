/**
 * 추가항목 메모는 편집기에서 평범한 줄글로 입력한다. 견적서 문서에서만 각 줄을
 * 하위 항목으로 보이게 하며, 사용자가 이미 쓴 불릿은 하나로 정규화한다.
 */
export function formatCustomItemDetail(detail: string | null | undefined) {
  if (!detail) return "";

  return detail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^(?:[-–—•·]+\s*)+/, "").trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}
