export type SelectionCategoryKey = "profile" | "staged" | "interior" | "unclassified";

export const REQUIRED_CLIENT_SELECTION_CATEGORIES = ["profile", "staged", "interior"] as const;

export function countSelectionsByCategory<T extends { category: string }>(items: readonly T[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
}

export function missingRequiredSelectionCategories<T extends { category: string }>(
  availableItems: readonly T[],
  selectedItems: readonly T[],
) {
  const available = countSelectionsByCategory(availableItems);
  const selected = countSelectionsByCategory(selectedItems);
  return REQUIRED_CLIENT_SELECTION_CATEGORIES.filter(
    (category) => (available[category] ?? 0) > 0 && (selected[category] ?? 0) === 0,
  );
}

export function validateSelectionMemo(value: unknown, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength) {
    return `메모는 ${maxLength}자까지 적을 수 있습니다.`;
  }
  return null;
}

export function isSelectionSubmissionLocked(input: {
  status: string;
  deadlineAt?: string | null;
  now?: Date;
}) {
  if (input.status === "closed" || input.status === "expired") return true;
  if (!input.deadlineAt) return false;
  return (input.now ?? new Date()).getTime() > new Date(input.deadlineAt).getTime();
}

export function canResubmitSelection(input: { submitted: boolean; allowResubmit: boolean }) {
  return !input.submitted || input.allowResubmit;
}

export function normalizeSelectionCategory(
  sceneName?: string | null,
  folderName?: string | null,
): SelectionCategoryKey {
  const value = `${sceneName ?? ""} ${folderName ?? ""}`.normalize("NFC").toLowerCase();
  const tokens = value.split(/[^a-z0-9가-힣]+/).filter(Boolean);
  if (tokens.some((token) => token === "profile") || /프로필/.test(value)) return "profile";
  if (tokens.some((token) => token === "interior") || /인테리어|외관|공간컷/.test(value)) return "interior";
  if (value.includes("skin_care") || tokens.some((token) => ["staged", "consultation", "treatment"].includes(token)) || /연출|상담|시술|진료|수술|피부관리/.test(value)) return "staged";
  return "unclassified";
}
