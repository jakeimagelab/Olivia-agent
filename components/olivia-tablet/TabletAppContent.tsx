"use client";

import dynamic from "next/dynamic";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { TabletAppId, TabletNavigationContext, TabletNavigationState } from "@/lib/olivia/tablet/navigation";
import TabletAppFrame from "./TabletAppFrame";
import TabletHome from "./TabletHome";
import TabletPhotoRemote from "./TabletPhotoRemote";
import TabletQuoteContract from "./TabletQuoteContract";
import TabletRouteFrame from "./TabletRouteFrame";
import TabletVoice from "./TabletVoice";
import styles from "./OliviaTabletShell.module.css";

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

export default function TabletAppContent({ activeApp, navigation, onNavigate }: {
  activeApp: TabletAppId;
  navigation: TabletNavigationState;
  onNavigate: (app: TabletAppId, context?: TabletNavigationContext) => void;
}) {
  let content;
  switch (activeApp) {
    case "customer": content = <TabletAppFrame><TabletClients /></TabletAppFrame>; break;
    case "calendar": content = <TabletAppFrame><TabletCalendar /></TabletAppFrame>; break;
    case "conti": content = (
      <TabletAppFrame compact scroll="page">
        <TabletConti
          key={navigation.resourceId ?? "new-conti"}
          initialRunId={navigation.resourceId}
          clientId={navigation.clientId}
          workflowRunId={navigation.workflowRunId}
        />
      </TabletAppFrame>
    ); break;
    case "documents": content = <TabletAppFrame><TabletDocuments /></TabletAppFrame>; break;
    case "olivia-chat": content = <TabletAppFrame><OliviaChatDockTarget id="tablet-os" priority={75} className={styles.tabletChatDock} /></TabletAppFrame>; break;
    case "review-studio": content = <TabletAppFrame compact><TabletReview /></TabletAppFrame>; break;
    case "memo": content = <TabletAppFrame><TabletMemo /></TabletAppFrame>; break;
    case "quote-contract": content = <TabletAppFrame compact><TabletQuoteContract /></TabletAppFrame>; break;
    case "channel-analysis": content = <TabletAppFrame><TabletRouteFrame href="/channel-analyzer" title="병원 채널분석" /></TabletAppFrame>; break;
    case "brand-image": content = <TabletAppFrame><TabletRouteFrame href="/hospital-brand-image-diagnosis" title="브랜드이미지" /></TabletAppFrame>; break;
    case "voice": content = <TabletAppFrame><TabletVoice /></TabletAppFrame>; break;
    case "photo-workspace": content = <TabletPhotoRemote />; break;
    default: content = <TabletHome onNavigate={onNavigate} />;
  }
  return <div className={styles.appViewport} data-tablet-active-app={activeApp}>{content}</div>;
}
