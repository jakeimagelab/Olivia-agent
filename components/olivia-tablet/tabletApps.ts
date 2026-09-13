import type { IconName } from "@/components/AppIcon";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";

export type TabletAppDefinition = {
  id: TabletAppId;
  title: string;
  eyebrow: string;
  description: string;
  status: string;
  registryAppId?: string;
  fallbackIcon: IconName;
  disabled?: boolean;
};

export const TABLET_APPS: TabletAppDefinition[] = [
  { id: "home", title: "홈", eyebrow: "오늘의 Olivia", description: "오늘의 업무를 한눈에 이어갑니다.", status: "LIVE", fallbackIcon: "today" },
  { id: "customer", title: "고객관리", eyebrow: "고객과 프로젝트", description: "고객 목록과 현재 프로젝트를 한 화면에서 관리합니다.", status: "CLIENT WORKSPACE", registryAppId: "customer", fallbackIcon: "clients" },
  { id: "calendar", title: "일정", eyebrow: "일정과 할 일", description: "촬영 일정과 해야 할 일을 터치 중심으로 확인합니다.", status: "SCHEDULE", registryAppId: "calendar", fallbackIcon: "work-calendar" },
  { id: "conti", title: "콘티", eyebrow: "촬영 설계", description: "콘티 제작부터 현장 확인까지 하나의 데이터로 이어갑니다.", status: "CONTI STUDIO", registryAppId: "conti", fallbackIcon: "storyboard" },
  { id: "documents", title: "문서함", eyebrow: "Olivia 문서", description: "최근 문서와 고객별 자료를 빠르게 찾아봅니다.", status: "DOCUMENTS", registryAppId: "documents", fallbackIcon: "library" },
  { id: "olivia-chat", title: "Olivia 채팅", eyebrow: "대화로 이어지는 업무", description: "대화의 맥락을 유지한 채 Olivia 업무를 이어갑니다.", status: "CONVERSATION", registryAppId: "olivia-chat", fallbackIcon: "olivia" },
  { id: "review-studio", title: "리뷰콘텐츠", eyebrow: "리뷰 디자인 스튜디오", description: "리뷰 콘텐츠를 같은 Canvas에서 편집하고 내보냅니다.", status: "DESIGN STUDIO", registryAppId: "review-studio", fallbackIcon: "review-content" },
  { id: "memo", title: "메모", eyebrow: "아이디어와 기록", description: "아이디어와 업무 기록을 목록과 편집 화면으로 정리합니다.", status: "MEMO", registryAppId: "memo", fallbackIcon: "memo" },
  { id: "quote-contract", title: "견적·계약", eyebrow: "문서 제작", description: "견적과 계약을 하나의 진입점에서 선택해 작성합니다.", status: "DOCUMENT STUDIO", registryAppId: "quote", fallbackIcon: "quote" },
  { id: "channel-analysis", title: "병원 채널분석", eyebrow: "채널 진단", description: "기존 채널 분석 기능을 Tablet 작업 화면에서 사용합니다.", status: "ANALYSIS", fallbackIcon: "channel-analysis" },
  { id: "brand-image", title: "브랜드이미지", eyebrow: "브랜드 진단", description: "병원의 현재 브랜드 이미지를 기존 진단 흐름으로 확인합니다.", status: "BRAND", fallbackIcon: "brand-image-diagnosis" },
  { id: "voice", title: "AI 음성", eyebrow: "준비 중", description: "Olivia의 AI 음성 작업 공간을 준비하고 있습니다.", status: "COMING SOON", fallbackIcon: "prompter", disabled: true },
  { id: "photo-workspace", title: "사진작업실", eyebrow: "Mac Studio 리모트", description: "아이패드에서 선택하고 Mac Studio에서 처리합니다.", status: "REMOTE", registryAppId: "photo-workspace", fallbackIcon: "photo-studio" },
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
