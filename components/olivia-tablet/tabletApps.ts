import type { IconName } from "@/components/AppIcon";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";

export type TabletAppDefinition = {
  id: TabletAppId;
  title: string;
  eyebrow: string;
  registryAppId?: string;
  fallbackIcon: IconName;
  disabled?: boolean;
};

export const TABLET_APPS: TabletAppDefinition[] = [
  { id: "home", title: "홈", eyebrow: "오늘의 Olivia", fallbackIcon: "today" },
  { id: "customer", title: "고객관리", eyebrow: "고객과 프로젝트", registryAppId: "customer", fallbackIcon: "clients" },
  { id: "calendar", title: "일정", eyebrow: "일정과 할 일", registryAppId: "calendar", fallbackIcon: "work-calendar" },
  { id: "documents", title: "문서함", eyebrow: "Olivia 문서", registryAppId: "documents", fallbackIcon: "library" },
  { id: "olivia-chat", title: "Olivia 채팅", eyebrow: "대화로 이어지는 업무", registryAppId: "olivia-chat", fallbackIcon: "olivia" },
  { id: "review-studio", title: "리뷰콘텐츠", eyebrow: "리뷰 디자인 스튜디오", registryAppId: "review-studio", fallbackIcon: "review-content" },
  { id: "memo", title: "메모", eyebrow: "아이디어와 기록", registryAppId: "memo", fallbackIcon: "memo" },
  { id: "quote-contract", title: "견적·계약", eyebrow: "기존 문서 제작 도구", registryAppId: "quote", fallbackIcon: "quote" },
  { id: "channel-analysis", title: "병원 채널분석", eyebrow: "기존 채널 분석", fallbackIcon: "channel-analysis" },
  { id: "brand-image", title: "브랜드이미지", eyebrow: "기존 브랜드 진단", fallbackIcon: "brand-image-diagnosis" },
  { id: "voice", title: "AI 음성", eyebrow: "준비 중", fallbackIcon: "prompter", disabled: true },
  { id: "photo-workspace", title: "사진작업실", eyebrow: "Mac Studio 리모트", registryAppId: "photo-workspace", fallbackIcon: "photo-studio" },
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
