import { Grid2X2, House } from "lucide-react";
import { ALL_TOOLS, type ToolDef } from "@/lib/toolNav";

// lib/toolNav.ts의 ALL_TOOLS가 Olivia 기능 실행의 단일 진실 공급원 — 사이드바/대시보드가 쓰는
// 것과 같은 배열이라 "사이드바엔 있는데 Olivia는 모른다"는 상황이 구조적으로 안 생긴다.
// 홈/더보기는 시각적 그리드 타일이 아니라서(더보기는 그리드 자체를 보여주는 메타 페이지) ALL_TOOLS에
// 없다 — 여기서만 별도로 얹는다.
export const OLIVIA_HOME_FEATURE: ToolDef = {
  title: "홈", desc: "홈 대시보드로 이동합니다.", href: "/admin/dashboard/home",
  icon: House, meta: "Home", orange: false, category: "dashboard",
  aliases: ["홈", "메인", "처음", "대시보드"],
};

export const OLIVIA_MORE_FEATURE: ToolDef = {
  title: "더보기", desc: "사용할 수 있는 모든 기능 목록을 카테고리별로 보여줍니다.", href: "/admin/tools",
  icon: Grid2X2, meta: "More Tools", orange: false, category: "dashboard",
  aliases: ["더보기", "전체 기능", "기능 목록", "사용할 수 있는 기능"],
};

export function getOliviaFeatures(): ToolDef[] {
  return [OLIVIA_HOME_FEATURE, OLIVIA_MORE_FEATURE, ...ALL_TOOLS];
}

export function findFeatureByHref(href: string): ToolDef | undefined {
  return getOliviaFeatures().find((tool) => tool.href === href);
}
