export type ClassicSelectionShortcut = "select" | "clear";

/** 기존 사진선택은 별점이 없는 선택/해제 방식이므로 1과 0만 단축키로 쓴다. */
export function resolveClassicSelectionShortcut(key: string): ClassicSelectionShortcut | null {
  if (key === "1") return "select";
  if (key === "0") return "clear";
  return null;
}
