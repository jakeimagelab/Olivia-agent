import type { IconName } from "@/components/AppIcon";
import type { MobilePrimaryView } from "./navigation";

export type MobileMode = "manage" | "viewer" | "request" | "full" | "status" | "hidden";
export type MobileAppGroup = "manage" | "photo" | "document" | "video" | "other";

export type MobileAppCapability = {
  appId: string;
  title: string;
  description: string;
  group: MobileAppGroup;
  modes: MobileMode[];
  mobileView?: MobilePrimaryView;
  iconName: IconName;
};

// 데스크톱 registry의 appId를 기준으로 한 모바일 제공 정책이다. 모바일 화면은 이 목록만
// 읽고 데스크톱 컴포넌트 registry를 import하지 않으므로 큰 편집기 번들이 함께 들어오지 않는다.
// registry와의 ID 정합성은 테스트에서 검증한다.
export const MOBILE_APP_CAPABILITIES: readonly MobileAppCapability[] = [
  { appId: "today", title: "홈", description: "오늘 일정과 진행 상황", group: "manage", modes: ["full"], mobileView: "home", iconName: "today" },
  { appId: "customer", title: "고객관리", description: "고객과 연결 문서 관리", group: "manage", modes: ["manage", "full"], mobileView: "clients", iconName: "clients" },
  { appId: "calendar", title: "일정", description: "일정과 할 일 관리", group: "manage", modes: ["manage", "full"], mobileView: "calendar", iconName: "work-calendar" },
  { appId: "work-journal", title: "업무일지", description: "업무 기록 확인", group: "manage", modes: ["viewer", "request"], mobileView: "chat", iconName: "work-log" },
  { appId: "person-select", title: "사진선택", description: "행사와 제출 현황 관리", group: "photo", modes: ["manage", "full"], mobileView: "person-select", iconName: "select-gallery" },
  { appId: "olivia-bridge", title: "Bridge 상태", description: "Mac Studio와 현재 작업 확인", group: "photo", modes: ["status", "request"], mobileView: "bridge", iconName: "photo-studio" },
  { appId: "photo-workspace", title: "사진작업실", description: "사진 작업 상태와 결과", group: "photo", modes: ["status", "request"], mobileView: "photo-workspace", iconName: "photo-studio" },
  { appId: "select-galleries", title: "고객 셀렉 갤러리", description: "셀렉 결과 확인", group: "photo", modes: ["viewer"], mobileView: "documents", iconName: "select-gallery" },
  { appId: "metadata-select", title: "메타데이터 셀렉", description: "셀렉 상태 확인", group: "photo", modes: ["viewer"], mobileView: "documents", iconName: "metadata-select" },
  { appId: "quote", title: "견적서", description: "견적 확인과 수정 요청", group: "document", modes: ["viewer", "request"], mobileView: "documents", iconName: "quote" },
  { appId: "contract", title: "계약서", description: "계약과 서명 상태 확인", group: "document", modes: ["viewer", "request"], mobileView: "documents", iconName: "contract" },
  { appId: "conti", title: "촬영 콘티", description: "장면 확인과 수정 요청", group: "document", modes: ["viewer", "request"], mobileView: "conti", iconName: "storyboard" },
  { appId: "documents", title: "문서함", description: "최근 문서 확인", group: "document", modes: ["viewer"], mobileView: "documents", iconName: "library" },
  { appId: "portrait-consent", title: "초상권 동의서", description: "동의와 서명 상태 확인", group: "document", modes: ["viewer"], mobileView: "documents", iconName: "contract" },
  { appId: "video-studio", title: "영상작업실", description: "영상 작업 상태와 결과", group: "video", modes: ["status"], mobileView: "video-workspace", iconName: "video-studio" },
  { appId: "prompter", title: "프롬프터", description: "모바일 전체화면 프롬프터", group: "video", modes: ["full"], mobileView: "prompter", iconName: "prompter" },
  { appId: "memo", title: "메모", description: "메모 확인과 작성", group: "other", modes: ["full"], mobileView: "memo", iconName: "memo" },
  { appId: "review-studio", title: "리뷰콘텐츠", description: "결과 확인과 요청", group: "other", modes: ["viewer", "request"], mobileView: "chat", iconName: "review-content" },
  { appId: "seo-delivery", title: "AI 검색 최적화 납품", description: "납품 상태 확인", group: "other", modes: ["viewer"], mobileView: "documents", iconName: "seo" },
  { appId: "mailing", title: "통합 메일링", description: "발송 상태 확인", group: "other", modes: ["viewer"], mobileView: "chat", iconName: "mailing" },
  { appId: "report", title: "업무 리포트", description: "업무 결과 확인", group: "other", modes: ["viewer"], mobileView: "documents", iconName: "work-report" },
  { appId: "brand-analysis", title: "홈페이지 브랜드 분석", description: "분석 결과 확인", group: "other", modes: ["viewer", "request"], mobileView: "chat", iconName: "brand-audit" },
  { appId: "trend-dashboard", title: "병원 트렌드 분석", description: "트렌드 결과 확인", group: "other", modes: ["viewer"], mobileView: "documents", iconName: "trend-analysis" },
  { appId: "hospital-brand-image-diagnosis", title: "병원 브랜드 이미지 진단", description: "진단 결과 확인", group: "other", modes: ["viewer"], mobileView: "documents", iconName: "brand-image-diagnosis" },
  { appId: "channel-analyzer", title: "병원 채널 분석", description: "채널 분석 결과 확인", group: "other", modes: ["viewer"], mobileView: "documents", iconName: "channel-analysis" },
] as const;

export function mobileCapabilityFor(appId: string) {
  return MOBILE_APP_CAPABILITIES.find((item) => item.appId === appId);
}

export function visibleMobileCapabilities() {
  return MOBILE_APP_CAPABILITIES.filter((item) => !item.modes.includes("hidden") && item.appId !== "today");
}
