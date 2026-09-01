const CATEGORY_COLORS = [
  { keys: ["하모니", "공통", "인포데스크"], bg: "#FEF3C7", text: "#92400E" },
  { keys: ["C-ARM", "씨암", "시술", "수술"], bg: "#FEE2E2", text: "#991B1B" },
  { keys: ["초음파", "주사"], bg: "#DBEAFE", text: "#1E40AF" },
  { keys: ["외래", "진료", "상담"], bg: "#FCE7F3", text: "#9D174D" },
  { keys: ["병동"], bg: "#EDE9FE", text: "#5B21B6" },
  { keys: ["재활", "물리치료"], bg: "#D1FAE5", text: "#065F46" },
  { keys: ["인테리어"], bg: "#F3F4F6", text: "#374151" },
] as const;

export function getContiCategoryColor(category: string) {
  return CATEGORY_COLORS.find((color) => color.keys.some((key) => category.includes(key)))
    || { bg: "#E6F4F1", text: "#155855" };
}
