import { createElement, type ComponentType, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { PhotoWorkspaceWindowContent } from "../adapters/PhotoWorkspaceWindowContent";
import { ClientsWindowContent } from "../adapters/ClientsWindowContent";
import { CalendarWindowContent } from "../adapters/CalendarWindowContent";
import { ReviewStudioWindowContent } from "../adapters/ReviewStudioWindowContent";
import { OliviaChatWindowContent } from "../adapters/OliviaChatWindowContent";
import { DocumentsWindowContent } from "../apps/documents/DocumentsWindowContent";
import { QuoteBuilderWindowContent } from "../adapters/QuoteBuilderWindowContent";
import { ContractBuilderWindowContent } from "../adapters/ContractBuilderWindowContent";
import { ContiBuilderWindowContent } from "../adapters/ContiBuilderWindowContent";
import { MemoWindowContent } from "../adapters/MemoWindowContent";
import { TodayWindowContent } from "../adapters/TodayWindowContent";
import { AllAppsWindowContent } from "../apps/all-apps/AllAppsWindowContent";
import { LegacyRouteWindowContent } from "../adapters/LegacyRouteWindowContent";

// OLIVIA OS App Registry(스펙 0-5) — 앱 실행에 필요한 정보의 중앙 관리 구조. quote/contract/
// conti는 Phase 3에서 레거시 70/30 시스템이 이미 쓰던 mode="modal" 빌더(QuoteBuilder 등)를
// 그대로 연결했다(ComingSoonPlaceholder였던 상태에서 전환, §41 no fake completion) — 단
// clientId/resourceId를 포함한 WindowContext도 같은 registry 경로로 전달한다.
export type OliviaAppDefinition = {
  id: string;
  title: string;
  icon: ReactNode;
  route?: string;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  singleton?: boolean;
  desktopShortcutOrder?: number;
  dockOrder?: number;
  component: ComponentType<{ context?: WindowContext }>;
};

const appIcon = (name: IconName) => createElement(Icon, { name, size: 26, "aria-hidden": true, focusable: false });

export const oliviaAppRegistry: OliviaAppDefinition[] = [
  {
    id: "today",
    title: "오늘",
    icon: appIcon("today"),
    defaultSize: { width: 520, height: 680 },
    minSize: { width: 360, height: 420 },
    singleton: true,
    component: TodayWindowContent,
  },
  {
    id: "customer",
    title: "고객관리",
    icon: appIcon("clients"),
    route: "/clients",
    defaultSize: { width: 1100, height: 700 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    desktopShortcutOrder: 1,
    dockOrder: 1,
    component: ClientsWindowContent,
  },
  {
    id: "calendar",
    title: "일정",
    icon: appIcon("work-calendar"),
    route: "/calendar",
    defaultSize: { width: 1050, height: 680 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    desktopShortcutOrder: 2,
    dockOrder: 2,
    component: CalendarWindowContent,
  },
  {
    id: "photo-workspace",
    title: "사진작업실",
    icon: appIcon("photo-studio"),
    route: "/photo-sorting",
    defaultSize: { width: 1200, height: 720 },
    minSize: { width: 720, height: 440 },
    singleton: true,
    desktopShortcutOrder: 3,
    dockOrder: 3,
    component: PhotoWorkspaceWindowContent,
  },
  {
    id: "quote",
    title: "견적서",
    icon: appIcon("quote"),
    route: "/quote",
    defaultSize: { width: 1000, height: 720 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    component: QuoteBuilderWindowContent,
  },
  {
    id: "contract",
    title: "계약서",
    icon: appIcon("contract"),
    route: "/contract",
    defaultSize: { width: 1000, height: 720 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    component: ContractBuilderWindowContent,
  },
  {
    id: "conti",
    title: "콘티 스튜디오",
    icon: appIcon("storyboard"),
    route: "/conti",
    defaultSize: { width: 1100, height: 760 },
    minSize: { width: 720, height: 440 },
    singleton: true,
    component: ContiBuilderWindowContent,
  },
  {
    id: "documents",
    title: "문서함",
    icon: appIcon("library"),
    defaultSize: { width: 1050, height: 680 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    desktopShortcutOrder: 4,
    dockOrder: 4,
    component: DocumentsWindowContent,
  },
  {
    id: "review-studio",
    title: "리뷰콘텐츠",
    icon: appIcon("review-content"),
    route: "/review-studio",
    defaultSize: { width: 1100, height: 740 },
    singleton: true,
    dockOrder: 5,
    component: ReviewStudioWindowContent,
  },
  {
    id: "memo",
    title: "메모",
    icon: appIcon("memo"),
    route: "/memo",
    defaultSize: { width: 980, height: 700 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    component: MemoWindowContent,
  },
  {
    id: "olivia-chat",
    title: "Olivia",
    icon: appIcon("olivia"),
    defaultSize: { width: 420, height: 640 },
    minSize: { width: 340, height: 420 },
    singleton: true,
    dockOrder: 6,
    component: OliviaChatWindowContent,
  },
  {
    id: "all-apps",
    title: "모든 앱",
    icon: appIcon("workspace"),
    defaultSize: { width: 880, height: 650 },
    minSize: { width: 520, height: 380 },
    singleton: true,
    component: AllAppsWindowContent,
  },
  {
    id: "legacy-route",
    title: "포토클리닉",
    icon: appIcon("workspace"),
    defaultSize: { width: 1120, height: 740 },
    minSize: { width: 520, height: 380 },
    singleton: true,
    component: LegacyRouteWindowContent,
  },
];

export function getOliviaApp(appId: string): OliviaAppDefinition | undefined {
  return oliviaAppRegistry.find((app) => app.id === appId);
}

export function getOliviaAppByRoute(href: string): OliviaAppDefinition | undefined {
  const pathname = href.split("?")[0].replace(/\/$/, "") || "/";
  return oliviaAppRegistry.find((app) => app.route === pathname);
}

export function getDesktopShortcutApps(): OliviaAppDefinition[] {
  return oliviaAppRegistry
    .filter((app) => app.desktopShortcutOrder !== undefined)
    .sort((a, b) => (a.desktopShortcutOrder ?? 0) - (b.desktopShortcutOrder ?? 0));
}

export function getDockApps(): OliviaAppDefinition[] {
  return oliviaAppRegistry
    .filter((app) => app.dockOrder !== undefined)
    .sort((a, b) => (a.dockOrder ?? 0) - (b.dockOrder ?? 0));
}
