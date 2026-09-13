"use client";

import dynamic from "next/dynamic";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
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

export default function TabletAppContent({ activeApp, onNavigate }: {
  activeApp: TabletAppId;
  onNavigate: (app: TabletAppId) => void;
}) {
  let content;
  switch (activeApp) {
    case "customer": content = <TabletClients />; break;
    case "calendar": content = <TabletCalendar />; break;
    case "documents": content = <TabletDocuments />; break;
    case "olivia-chat": content = <OliviaChatDockTarget id="tablet-os" priority={75} className={styles.tabletChatDock} />; break;
    case "review-studio": content = <TabletReview />; break;
    case "memo": content = <TabletMemo />; break;
    case "quote-contract": content = <TabletQuoteContract />; break;
    case "channel-analysis": content = <TabletRouteFrame href="/channel-analyzer" title="병원 채널분석" />; break;
    case "brand-image": content = <TabletRouteFrame href="/hospital-brand-image-diagnosis" title="브랜드이미지" />; break;
    case "voice": content = <TabletVoice />; break;
    case "photo-workspace": content = <TabletPhotoRemote />; break;
    default: content = <TabletHome onNavigate={onNavigate} />;
  }
  return <div className={styles.appViewport} data-tablet-active-app={activeApp}>{content}</div>;
}
