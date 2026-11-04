import type { IconName } from "@/components/AppIcon";
import type { MobilePrimaryView } from "./navigation";

export type MobileMode = "manage" | "viewer" | "request" | "full" | "status" | "desktop-only" | "hidden";
export type MobileAppGroup = "manage" | "photo" | "document" | "video" | "other";
export type MobileCapabilityStatus = "ready" | "limited" | "desktop-only";

export type MobileAppCapability = {
  appId: string;
  title: string;
  description: string;
  group: MobileAppGroup;
  modes: MobileMode[];
  mobileView?: MobilePrimaryView;
  iconName: IconName;
  status: MobileCapabilityStatus;
  issues: readonly string[];
  supplemental?: boolean;
};

// 데스크톱 registry의 appId를 기준으로 한 모바일 제공 정책이다. 모바일 화면은 이 목록만
// 읽고 데스크톱 컴포넌트 registry를 import하지 않으므로 큰 편집기 번들이 함께 들어오지 않는다.
// registry와의 ID 정합성은 테스트에서 검증한다.
export const MOBILE_APP_CAPABILITIES: readonly MobileAppCapability[] = [
  { appId: "today", title: "홈", description: "오늘 일정과 진행 상황", group: "manage", modes: ["full"], mobileView: "home", iconName: "today", status: "ready", issues: [] },
  { appId: "customer", title: "고객관리", description: "고객과 연결 문서 관리", group: "manage", modes: ["manage", "full"], mobileView: "clients", iconName: "clients", status: "ready", issues: [] },
  { appId: "calendar", title: "일정", description: "일정과 할 일 관리", group: "manage", modes: ["manage", "full"], mobileView: "calendar", iconName: "work-calendar", status: "ready", issues: [] },
  { appId: "work-journal", title: "업무일지", description: "Olivia를 통한 기록 요청", group: "manage", modes: ["request"], mobileView: "chat", iconName: "work-log", status: "limited", issues: ["직접 편집 화면은 데스크톱 전용"] },
  { appId: "person-select", title: "사진선택", description: "행사와 제출 현황 관리", group: "photo", modes: ["manage", "full"], mobileView: "person-select", iconName: "select-gallery", status: "ready", issues: [] },
  { appId: "olivia-bridge", title: "Bridge 상태", description: "Mac Studio와 현재 작업 확인", group: "photo", modes: ["status", "request"], mobileView: "bridge", iconName: "photo-studio", status: "ready", issues: [] },
  { appId: "photo-workspace", title: "사진작업실", description: "사진 작업 상태와 결과", group: "photo", modes: ["status", "request"], mobileView: "photo-workspace", iconName: "photo-studio", status: "ready", issues: [] },
  { appId: "select-galleries", title: "고객 셀렉 갤러리", description: "대량 셀렉 조작은 데스크톱에서 사용", group: "photo", modes: ["desktop-only"], iconName: "select-gallery", status: "desktop-only", issues: ["모바일 전용 결과 viewer 없음"] },
  { appId: "metadata-select", title: "메타데이터 셀렉", description: "대량 메타데이터 조작은 데스크톱에서 사용", group: "photo", modes: ["desktop-only"], iconName: "metadata-select", status: "desktop-only", issues: ["모바일 전용 viewer 없음"] },
  { appId: "quote", title: "견적서", description: "견적 확인과 수정 요청", group: "document", modes: ["viewer", "request"], mobileView: "documents", iconName: "quote", status: "ready", issues: [] },
  { appId: "contract", title: "계약서", description: "계약과 서명 상태 확인", group: "document", modes: ["viewer", "request"], mobileView: "documents", iconName: "contract", status: "ready", issues: [] },
  { appId: "conti", title: "촬영 콘티", description: "장면 확인과 수정 요청", group: "document", modes: ["viewer", "request"], mobileView: "conti", iconName: "storyboard", status: "ready", issues: [] },
  { appId: "documents", title: "문서함", description: "최근 문서 확인", group: "document", modes: ["viewer"], mobileView: "documents", iconName: "library", status: "ready", issues: [] },
  { appId: "portrait-consent", title: "초상권 동의서", description: "서명 화면은 별도 모바일 경로로 사용", group: "document", modes: ["desktop-only"], iconName: "contract", status: "desktop-only", issues: ["관리자 모바일 viewer 미구현"] },
  { appId: "staff-guide", title: "스텝 가이드", description: "현장 가이드는 데스크톱/공개 경로에서 사용", group: "document", modes: ["desktop-only"], iconName: "work-log", status: "desktop-only", issues: ["Olivia 모바일 shell 전용 화면 없음"] },
  { appId: "video-studio", title: "영상작업실", description: "영상 작업 상태와 요청", group: "video", modes: ["status", "request"], mobileView: "video-workspace", iconName: "video-studio", status: "ready", issues: [] },
  { appId: "prompter", title: "프롬프터", description: "모바일 전체화면 프롬프터", group: "video", modes: ["full"], mobileView: "prompter", iconName: "prompter", status: "ready", issues: [], supplemental: true },
  { appId: "memo", title: "메모", description: "메모 확인과 작성", group: "other", modes: ["full"], mobileView: "memo", iconName: "memo", status: "ready", issues: [] },
  { appId: "olivia-chat", title: "Olivia", description: "전체화면 Olivia 대화", group: "other", modes: ["full"], mobileView: "chat", iconName: "olivia", status: "ready", issues: [] },
  { appId: "all-apps", title: "전체 기능", description: "모바일 기능 목록", group: "other", modes: ["full"], mobileView: "all-apps", iconName: "workspace", status: "ready", issues: [] },
  { appId: "review-studio", title: "리뷰콘텐츠", description: "Olivia를 통한 결과 확인 요청", group: "other", modes: ["request"], mobileView: "chat", iconName: "review-content", status: "limited", issues: ["전용 모바일 결과 viewer 없음"] },
  { appId: "seo-delivery", title: "AI 검색 최적화 납품", description: "납품 관리 화면은 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "seo", status: "desktop-only", issues: ["모바일 전용 상태 API 미연결"] },
  { appId: "mailing", title: "통합 메일링", description: "Olivia를 통한 발송 요청", group: "other", modes: ["request"], mobileView: "chat", iconName: "mailing", status: "limited", issues: ["직접 발송 화면은 데스크톱 전용"] },
  { appId: "report", title: "업무 리포트", description: "리포트 편집은 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "work-report", status: "desktop-only", issues: ["모바일 전용 viewer 없음"] },
  { appId: "brand-analysis", title: "홈페이지 브랜드 분석", description: "Olivia를 통한 분석 요청", group: "other", modes: ["request"], mobileView: "chat", iconName: "brand-audit", status: "limited", issues: ["분석 입력 화면은 데스크톱 전용"] },
  { appId: "trend-dashboard", title: "병원 트렌드 분석", description: "분석 대시보드는 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "trend-analysis", status: "desktop-only", issues: ["모바일 전용 viewer 없음"] },
  { appId: "hospital-brand-image-diagnosis", title: "병원 브랜드 이미지 진단", description: "진단 화면은 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "brand-image-diagnosis", status: "desktop-only", issues: ["모바일 전용 viewer 없음"] },
  { appId: "channel-analyzer", title: "병원 채널 분석", description: "채널 분석은 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "channel-analysis", status: "desktop-only", issues: ["모바일 전용 viewer 없음"] },
  { appId: "legacy-route", title: "기존 기능창", description: "호환 기능은 데스크톱에서 사용", group: "other", modes: ["desktop-only"], iconName: "workspace", status: "desktop-only", issues: ["iframe 호환 화면은 모바일 미지원"] },
] as const;

export function mobileCapabilityFor(appId: string) {
  return MOBILE_APP_CAPABILITIES.find((item) => item.appId === appId);
}

export function visibleMobileCapabilities() {
  return MOBILE_APP_CAPABILITIES.filter((item) => !item.modes.includes("hidden") && !item.modes.includes("desktop-only") && item.appId !== "today");
}

export function auditMobileCapabilityCoverage(desktopAppIds: readonly string[]) {
  const registered = new Set(MOBILE_APP_CAPABILITIES.filter((item) => !item.supplemental).map((item) => item.appId));
  const desktop = new Set(desktopAppIds);
  return {
    missing: desktopAppIds.filter((appId) => !registered.has(appId)),
    unknown: [...registered].filter((appId) => !desktop.has(appId)),
  };
}
