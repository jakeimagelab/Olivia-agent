import type { ToolDef } from "@/lib/toolNav";

// /admin/tools(전체보기) 전용 표시 카테고리 — lib/toolNav.ts의 NavCategory("dashboard"|"crm"|
// "tools")는 components/GlobalFeatureSidebar.tsx, app/page.tsx(예전 홈), app/layout.tsx도 함께
// 쓰는 공유 분류라 여기서 바꾸지 않는다. 이 파일은 ALL_TOOLS의 기존 href를 키로 삼아 화면
// 표시용으로만 다시 묶는 순수 매핑이다 — 새 기능 목록을 하드코딩하는 게 아니라 이미 있는
// 40개 도구의 분류만 재정리한다(전체보기 개편, 2026-08-31).
export type DisplayCategory = "document" | "crm" | "schedule" | "media" | "ai" | "etc";

export const DISPLAY_CATEGORY_ORDER: DisplayCategory[] = ["document", "crm", "schedule", "media", "ai", "etc"];

export const DISPLAY_CATEGORY_LABEL: Record<DisplayCategory, string> = {
  document: "문서",
  crm: "고객관리",
  schedule: "일정",
  media: "사진 / 영상",
  ai: "AI",
  etc: "기타",
};

const HREF_TO_DISPLAY_CATEGORY: Record<string, DisplayCategory> = {
  "/quote": "document",
  "/contract": "document",
  "/conti": "document",
  "/clients": "crm",
  "/per": "crm",
  "/portal-admin": "crm",
  "/mailing": "crm",
  "/calendar": "schedule",
  "/work-journal": "schedule",
  "/select-galleries": "media",
  "/photo-sorting": "media",
  "/select-match": "media",
  "/metadata-select": "media",
  "/raw-select": "media",
  "/video-sorting": "media",
  "/video-convert": "media",
  "/photo-retouching": "media",
  "/youtube-editing-conti": "media",
  "/broll-prompt": "ai",
  "/daily-ideas": "ai",
  "/brand-analysis": "ai",
  "/ai-trust-gap": "ai",
  "/diagnosis": "ai",
  "/hospital-brand-image-diagnosis": "ai",
  "/channel-analyzer": "ai",
  "/trend-dashboard": "ai",
  "/image-generator": "ai",
  "/seo-delivery": "ai",
};

export function getDisplayCategory(tool: ToolDef): DisplayCategory {
  return HREF_TO_DISPLAY_CATEGORY[tool.href] ?? "etc";
}

export function groupToolsByDisplayCategory(tools: ToolDef[]): { category: DisplayCategory; label: string; items: ToolDef[] }[] {
  return DISPLAY_CATEGORY_ORDER.map((category) => ({
    category,
    label: DISPLAY_CATEGORY_LABEL[category],
    items: tools.filter((tool) => getDisplayCategory(tool) === category),
  }));
}
