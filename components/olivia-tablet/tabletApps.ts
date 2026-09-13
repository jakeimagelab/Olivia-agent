import type { IconName } from "@/components/AppIcon";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";

export type TabletAppDefinition = {
  id: TabletAppId;
  title: string;
  registryAppId?: string;
  fallbackIcon: IconName;
  disabled?: boolean;
};

export const TABLET_APPS: TabletAppDefinition[] = [
  { id: "home", title: "홈", fallbackIcon: "today" },
  { id: "customer", title: "고객관리", registryAppId: "customer", fallbackIcon: "clients" },
  { id: "calendar", title: "일정", registryAppId: "calendar", fallbackIcon: "work-calendar" },
  { id: "conti", title: "콘티", registryAppId: "conti", fallbackIcon: "storyboard" },
  { id: "documents", title: "문서함", registryAppId: "documents", fallbackIcon: "library" },
  { id: "olivia-chat", title: "Olivia 채팅", registryAppId: "olivia-chat", fallbackIcon: "olivia" },
  { id: "review-studio", title: "리뷰콘텐츠", registryAppId: "review-studio", fallbackIcon: "review-content" },
  { id: "memo", title: "메모", registryAppId: "memo", fallbackIcon: "memo" },
  { id: "quote-contract", title: "견적·계약", registryAppId: "quote", fallbackIcon: "quote" },
  { id: "channel-analysis", title: "병원 채널분석", fallbackIcon: "channel-analysis" },
  { id: "brand-image", title: "브랜드이미지", fallbackIcon: "brand-image-diagnosis" },
  { id: "voice", title: "음성 기록", fallbackIcon: "prompter" },
  { id: "photo-workspace", title: "사진작업실", registryAppId: "photo-workspace", fallbackIcon: "photo-studio" },
];

export function getTabletApp(appId: TabletAppId) {
  return TABLET_APPS.find((app) => app.id === appId) ?? TABLET_APPS[0];
}

export function resolveTabletAppIconSource(appId: TabletAppId) {
  const app = getTabletApp(appId);
  return app.registryAppId
    ? { kind: "registry" as const, appId: app.registryAppId }
    : { kind: "shared" as const, iconName: app.fallbackIcon };
}
