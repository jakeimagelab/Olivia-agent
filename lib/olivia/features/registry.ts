import { Grid2X2, House } from "lucide-react";
import { ALL_TOOLS, type ToolDef } from "@/lib/toolNav";
import { WORKSPACE_GROUPS, isIntegratedToolHref } from "@/lib/workspaceGroups";

// 기존 ALL_TOOLS는 Sidebar/기존 route 호환성을 유지하고, 통합 대상은 WORKSPACE_GROUPS의
// canonical 목적지와 별칭을 사용한다. 독립 기능은 계속 ALL_TOOLS를 그대로 쓴다.
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

function getWorkspaceFeatures(): ToolDef[] {
  return WORKSPACE_GROUPS.flatMap((group) => [
    {
      title: group.title,
      desc: group.description,
      href: group.href,
      icon: group.icon,
      meta: "Workspace",
      orange: false,
      category: "tools" as const,
      aliases: group.aliases,
    },
    ...group.tools.map((tool) => ({
      title: tool.title,
      desc: `${group.title}에서 ${tool.title} 기능을 엽니다.`,
      href: tool.href,
      icon: group.icon,
      meta: group.title,
      orange: false,
      category: "tools" as const,
      aliases: tool.aliases,
    })),
  ]);
}

export function getWorkspaceAwareTools(): ToolDef[] {
  const standaloneFeatures = ALL_TOOLS.filter((tool) => !isIntegratedToolHref(tool.href));
  return [...getWorkspaceFeatures(), ...standaloneFeatures];
}

export function getOliviaFeatures(): ToolDef[] {
  return [OLIVIA_HOME_FEATURE, OLIVIA_MORE_FEATURE, ...getWorkspaceAwareTools()];
}

export function findFeatureByHref(href: string): ToolDef | undefined {
  return getOliviaFeatures().find((tool) => tool.href === href)
    ?? ALL_TOOLS.find((tool) => tool.href === href);
}
