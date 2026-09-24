"use client";

import dynamic from "next/dynamic";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { TabletAppId, TabletNavigationContext, TabletNavigationState } from "@/lib/olivia/tablet/navigation";
import TabletAppFrame from "./TabletAppFrame";
import TabletHome from "./TabletHome";
import TabletPhotoRemote from "./TabletPhotoRemote";
import TabletQuoteContract from "./TabletQuoteContract";
import TabletVoice from "./TabletVoice";
import styles from "./OliviaTabletShell.module.css";
import { AnalysisHostProvider } from "@/components/analysis-workspace/AnalysisHostContext";

function createLoadingComponent(label: string) {
  function TabletAppLoading() {
    return <div className={styles.appLoading}>{label} 준비 중…</div>;
  }

  TabletAppLoading.displayName = `TabletAppLoading(${label})`;
  return TabletAppLoading;
}

const TabletClients = dynamic(
  () => import("@/components/olivia-os/adapters/ClientsWindowContent").then((module) => module.ClientsWindowContent),
  { ssr: false, loading: createLoadingComponent("고객관리") },
);
const TabletCalendar = dynamic(
  () => import("@/components/olivia-os/adapters/CalendarWindowContent").then((module) => module.CalendarWindowContent),
  { ssr: false, loading: createLoadingComponent("일정") },
);
const TabletDocuments = dynamic(
  () => import("@/components/olivia-os/apps/documents/DocumentsWindowContent").then((module) => module.DocumentsWindowContent),
  { ssr: false, loading: createLoadingComponent("문서함") },
);
const TabletReview = dynamic(
  () => import("@/components/olivia-os/adapters/ReviewStudioWindowContent").then((module) => module.ReviewStudioWindowContent),
  { ssr: false, loading: createLoadingComponent("리뷰콘텐츠") },
);
const TabletMemo = dynamic(
  () => import("@/components/olivia-os/adapters/MemoWindowContent").then((module) => module.MemoWindowContent),
  { ssr: false, loading: createLoadingComponent("메모") },
);
const TabletConti = dynamic(
  () => import("@/components/conti/v2/ContiWorkspaceAdapter"),
  { ssr: false, loading: createLoadingComponent("콘티") },
);
const TabletChannelAnalysis = dynamic(
  () => import("@/app/channel-analyzer/page"),
  { ssr: false, loading: createLoadingComponent("병원 채널분석") },
);
const TabletBrandImage = dynamic(
  () => import("@/app/hospital-brand-image-diagnosis/page"),
  { ssr: false, loading: createLoadingComponent("브랜드 이미지 진단") },
);

export default function TabletAppContent({ activeApp, navigation, onNavigate }: {
  activeApp: TabletAppId;
  navigation: TabletNavigationState;
  onNavigate: (app: TabletAppId, context?: TabletNavigationContext) => void;
}) {
  let content;
  switch (activeApp) {
    case "customer": content = (
      <TabletAppFrame>
        <TabletClients context={{
          clientId: navigation.clientId,
          projectId: navigation.workflowRunId,
          workflowRunId: navigation.workflowRunId,
          routeHref: "/clients",
        }} />
      </TabletAppFrame>
    ); break;
    case "calendar": content = <TabletAppFrame><TabletCalendar /></TabletAppFrame>; break;
    case "conti": content = (
      <TabletAppFrame compact scroll="page">
        <TabletConti
          key={navigation.resourceId ?? "new-conti"}
          surface="tablet"
          initialRunId={navigation.resourceId}
          clientId={navigation.clientId}
          workflowRunId={navigation.workflowRunId}
        />
      </TabletAppFrame>
    ); break;
    case "documents": content = <TabletAppFrame><TabletDocuments surface="tablet" /></TabletAppFrame>; break;
    case "olivia-chat": content = <TabletAppFrame><OliviaChatDockTarget id="tablet-os" priority={75} className={styles.tabletChatDock} /></TabletAppFrame>; break;
    case "review-studio": content = <TabletAppFrame compact><TabletReview /></TabletAppFrame>; break;
    case "memo": content = <TabletAppFrame><TabletMemo /></TabletAppFrame>; break;
    case "quote-contract": content = <TabletAppFrame compact><TabletQuoteContract /></TabletAppFrame>; break;
    case "channel-analysis": content = <TabletAppFrame compact><AnalysisHostProvider surface="tablet"><TabletChannelAnalysis /></AnalysisHostProvider></TabletAppFrame>; break;
    case "brand-image": content = <TabletAppFrame compact><AnalysisHostProvider surface="tablet"><TabletBrandImage /></AnalysisHostProvider></TabletAppFrame>; break;
    // 코드 요청서(2026-09-22, 태블릿 스펙 §7-1) — 음성 기록 목록을 녹음 화면 아래에 추가했다.
    // 기본 "contained" 모드는 TabletAppFrame > *에 height:100%를 강제해서 OliviaRecorder
    // 하나가 프레임 전체를 채우고 그 아래 목록이 보이지 않게 된다 — conti 케이스처럼
    // scroll="page"로 바꿔서 두 컴포넌트가 자연스러운 높이로 쌓이고 프레임 자체가 스크롤되게 한다.
    case "voice": content = <TabletAppFrame scroll="page"><TabletVoice /></TabletAppFrame>; break;
    case "photo-workspace": content = <TabletPhotoRemote />; break;
    default: content = <TabletHome onNavigate={onNavigate} />;
  }
  return (
    <div className={styles.appViewport} data-tablet-active-app={activeApp}>
      <div key={activeApp} className={styles.appTransition} data-tablet-app-transition>
        {content}
      </div>
    </div>
  );
}
