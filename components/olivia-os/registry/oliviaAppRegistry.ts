import { createElement, type ComponentType, type ReactNode } from "react";
import type { IconName } from "@/components/Icon";
import { AppIcon } from "@/components/AppIcon";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { PhotoWorkspaceWindowContent } from "../adapters/PhotoWorkspaceWindowContent";
import { ClientsWindowContent } from "../adapters/ClientsWindowContent";
import { CalendarWindowContent } from "../adapters/CalendarWindowContent";
import { ReviewStudioWindowContent } from "../adapters/ReviewStudioWindowContent";
import { OliviaChatWindowContent } from "../adapters/OliviaChatWindowContent";
import { DocumentsWindowContent } from "../apps/documents/DocumentsWindowContent";
import { QuoteBuilderWindowContent } from "../adapters/QuoteBuilderWindowContent";
import { ContractBuilderWindowContent } from "../adapters/ContractBuilderWindowContent";
import { ContiWindowContent } from "../adapters/ContiWindowContent";
import { PortraitConsentWindowContent } from "../adapters/PortraitConsentWindowContent";
import { TodayWindowContent } from "../adapters/TodayWindowContent";
import { AllAppsWindowContent } from "../apps/all-apps/AllAppsWindowContent";
import { LegacyRouteWindowContent } from "../adapters/LegacyRouteWindowContent";
import { CalendarAppIcon } from "../CalendarAppIcon";
import { MemoWindowContent } from "../adapters/MemoWindowContent";
import { BrandAnalysisWindowContent } from "../adapters/BrandAnalysisWindowContent";
import { TrendDashboardWindowContent } from "../adapters/TrendDashboardWindowContent";
import { HospitalBrandDiagnosisWindowContent } from "../adapters/HospitalBrandDiagnosisWindowContent";
import { ChannelAnalyzerWindowContent } from "../adapters/ChannelAnalyzerWindowContent";
import { MetadataSelectWindowContent } from "../adapters/MetadataSelectWindowContent";
import { SelectGalleriesWindowContent } from "../adapters/SelectGalleriesWindowContent";
import { SeoDeliveryWindowContent } from "../adapters/SeoDeliveryWindowContent";
import { MailingWindowContent } from "../adapters/MailingWindowContent";
import { WorkJournalWindowContent } from "../adapters/WorkJournalWindowContent";
import { ReportWindowContent } from "../adapters/ReportWindowContent";
import { getCanonicalWorkspaceHref } from "@/lib/workspaceGroups";

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

const appIcon = (name: IconName) => createElement(AppIcon, { name, size: 26, "aria-hidden": true, focusable: false });

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
    // 오늘 날짜가 실제로 찍혀 있는 아이콘(맥 캘린더 방식) — 다른 앱들처럼 정적 아이콘 하나로
    // 고정하지 않고 컴포넌트를 그대로 넣는다. AppIcon이 이 값을 감싸는 tile 크기/모양만
    // 통일해줄 뿐, 내용물이 무엇이든(정적 아이콘이든 이 컴포넌트든) 그대로 렌더한다.
    icon: createElement(CalendarAppIcon),
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
    minSize: { width: 420, height: 440 },
    singleton: true,
    desktopShortcutOrder: 3,
    dockOrder: 3,
    component: PhotoWorkspaceWindowContent,
  },
  {
    id: "metadata-select",
    title: "메타데이터 셀렉",
    icon: appIcon("metadata-select"),
    route: "/metadata-select",
    defaultSize: { width: 980, height: 720 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: MetadataSelectWindowContent,
  },
  {
    id: "select-galleries",
    title: "고객 셀렉 갤러리",
    icon: appIcon("select-gallery"),
    route: "/select-galleries",
    defaultSize: { width: 980, height: 720 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: SelectGalleriesWindowContent,
  },
  {
    id: "seo-delivery",
    title: "AI 검색 최적화 납품",
    icon: appIcon("seo"),
    route: "/seo-delivery",
    defaultSize: { width: 1120, height: 740 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: SeoDeliveryWindowContent,
  },
  {
    id: "mailing",
    title: "통합 메일링",
    icon: appIcon("mailing"),
    route: "/mailing",
    defaultSize: { width: 1120, height: 740 },
    minSize: { width: 680, height: 440 },
    singleton: true,
    component: MailingWindowContent,
  },
  {
    id: "work-journal",
    title: "업무일지",
    icon: appIcon("work-log"),
    route: "/work-journal",
    defaultSize: { width: 1180, height: 760 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: WorkJournalWindowContent,
  },
  {
    id: "report",
    title: "업무 리포트",
    icon: appIcon("work-report"),
    route: "/report",
    defaultSize: { width: 980, height: 720 },
    minSize: { width: 580, height: 420 },
    singleton: true,
    component: ReportWindowContent,
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
    title: "콘티",
    icon: appIcon("storyboard"),
    route: "/conti",
    defaultSize: { width: 1100, height: 760 },
    minSize: { width: 720, height: 440 },
    singleton: true,
    component: ContiWindowContent,
  },
  {
    id: "portrait-consent",
    title: "초상권 동의서",
    icon: appIcon("contract"),
    route: "/portrait-consent",
    defaultSize: { width: 1000, height: 720 },
    minSize: { width: 640, height: 420 },
    singleton: true,
    component: PortraitConsentWindowContent,
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
    id: "brand-analysis",
    title: "홈페이지 브랜드 분석",
    icon: appIcon("brand-audit"),
    route: "/brand-analysis",
    defaultSize: { width: 1120, height: 760 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: BrandAnalysisWindowContent,
  },
  {
    id: "trend-dashboard",
    title: "병원 트렌드 분석",
    icon: appIcon("trend-analysis"),
    route: "/trend-dashboard",
    defaultSize: { width: 1180, height: 780 },
    minSize: { width: 660, height: 460 },
    singleton: true,
    component: TrendDashboardWindowContent,
  },
  {
    id: "hospital-brand-image-diagnosis",
    title: "병원 브랜드 이미지 진단",
    icon: appIcon("brand-image-diagnosis"),
    route: "/hospital-brand-image-diagnosis",
    defaultSize: { width: 1080, height: 760 },
    minSize: { width: 600, height: 440 },
    singleton: true,
    component: HospitalBrandDiagnosisWindowContent,
  },
  {
    id: "channel-analyzer",
    title: "병원 채널 분석",
    icon: appIcon("channel-analysis"),
    route: "/channel-analyzer",
    defaultSize: { width: 1120, height: 760 },
    minSize: { width: 620, height: 440 },
    singleton: true,
    component: ChannelAnalyzerWindowContent,
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

const NATIVE_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  "/photoclinic": "/quote",
  "/clients/reviews": "/review-studio",
};

function appForPathname(pathname: string): OliviaAppDefinition | undefined {
  const exact = oliviaAppRegistry.find((app) => app.route === pathname);
  if (exact) return exact;
  if (/^\/select-galleries\/[^/]+$/.test(pathname)) {
    return oliviaAppRegistry.find((app) => app.id === "select-galleries");
  }
  return undefined;
}

export type OliviaResolvedAppRoute = {
  app: OliviaAppDefinition;
  href: string;
  originalHref: string;
};

/**
 * Resolves old/user-facing aliases before allowing the launcher to fall back to the
 * compatibility iframe. Exact native routes win so `/review-studio` continues to
 * open a specific review while `/clients/reviews` opens the same native workspace.
 */
export function resolveOliviaAppRoute(href: string): OliviaResolvedAppRoute | undefined {
  const pathname = href.split("?")[0].replace(/\/$/, "") || "/";
  const exact = appForPathname(pathname);
  if (exact) return { app: exact, href, originalHref: href };

  const canonicalWorkspaceHref = getCanonicalWorkspaceHref(href);
  const canonicalUrl = new URL(canonicalWorkspaceHref, "https://olivia.local");
  const aliasedPathname = NATIVE_ROUTE_ALIASES[canonicalUrl.pathname] ?? canonicalUrl.pathname;
  const app = appForPathname(aliasedPathname);
  if (!app) return undefined;

  const resolvedHref = `${aliasedPathname}${canonicalUrl.search}`;
  return { app, href: resolvedHref, originalHref: href };
}

export function getOliviaAppByRoute(href: string): OliviaAppDefinition | undefined {
  return resolveOliviaAppRoute(href)?.app;
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
