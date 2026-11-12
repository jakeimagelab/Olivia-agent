"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileErrorBoundary } from "./MobileErrorBoundary";
import MobileBottomNav from "./MobileBottomNav";
import MobileHome from "./MobileHome";
import MobileCalendar from "./MobileCalendar";
import MobileMemo from "./MobileMemo";
import MobileClients from "./MobileClients";
import MobileContiFieldView from "./MobileContiFieldView";
import MobileDocuments, { type MobileDocumentsSection } from "./MobileDocuments";
import MobileOliviaChat from "./MobileOliviaChat";
import MobilePhotoPending from "./MobilePhotoPending";
import MobileResourcePreview from "./MobileResourcePreview";
import MobileAllApps from "./MobileAllApps";
import MobilePersonSelect from "./MobilePersonSelect";
import MobileBridgeStatus from "./MobileBridgeStatus";
import { OliviaUiSurfaceProvider } from "@/lib/olivia/surfaceContext";
import {
  buildMobileNavigationUrl,
  parseMobileNavigation,
  primaryViewForNavigation,
  resolveMobileStartupNavigation,
  type MobileNavigationState,
  type MobileOliviaTarget,
  type MobilePrimaryView,
} from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";
import { clearOliviaRootLaunchParams, type OliviaRootLaunch } from "@/lib/olivia/navigation/clientRoute";
import GlobalRecordingBar from "@/components/voice/GlobalRecordingBar";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

const MobileVoice = dynamic(() => import("./MobileVoice"), {
  loading: () => <div className={styles.mobileFeatureLoading}>음성 기록을 준비하고 있어요...</div>,
});
const MobilePhotoWorkspace = dynamic(() => import("./MobilePhotoWorkspace"), {
  loading: () => <div className={styles.mobileFeatureLoading}>사진작업실을 준비하고 있어요...</div>,
});
const MobileVideoWorkspace = dynamic(() => import("./MobileVideoWorkspace"), {
  loading: () => <div className={styles.mobileFeatureLoading}>영상작업실 상태를 확인하고 있어요...</div>,
});
const MobilePrompter = dynamic(() => import("./MobilePrompter"), {
  loading: () => <div className={styles.mobileFeatureLoading}>프롬프터를 준비하고 있어요...</div>,
});

function currentNavigation(): MobileNavigationState {
  return typeof window === "undefined" ? { view: "home" } : parseMobileNavigation(window.location.search);
}

export default function OliviaMobileShell({ initialLaunch }: { initialLaunch?: OliviaRootLaunch | null }) {
  const [navigation, setNavigation] = useState<MobileNavigationState>(() => resolveMobileStartupNavigation(initialLaunch));
  const [documentsSection, setDocumentsSection] = useState<MobileDocumentsSection>("quote-contract");
  const [oliviaTarget, setOliviaTarget] = useState<MobileOliviaTarget | null>(null);
  const chatReturnRef = useRef<MobileNavigationState>({ view: "home" });

  useEffect(() => {
    const onPopState = () => setNavigation(currentNavigation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (initialLaunch) return;
    const homeUrl = buildMobileNavigationUrl(window.location.href, { view: "home" });
    window.history.replaceState(window.history.state, "", homeUrl);
  }, [initialLaunch]);

  useEffect(() => {
    if (initialLaunch?.appId !== "customer") return;
    const url = new URL(clearOliviaRootLaunchParams(window.location.href), window.location.origin);
    url.searchParams.set("mobileView", "clients");
    if (initialLaunch.clientId) url.searchParams.set("mobileTargetId", initialLaunch.clientId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [initialLaunch]);

  useEffect(() => {
    if (["home", "calendar", "memo", "documents", "all-apps", "bridge", "photo-workspace", "video-workspace", "prompter", "voice"].includes(navigation.view)) {
      useOliviaContextStore.getState().clearWindowLink();
    }
  }, [navigation.view]);

  const navigate = useCallback((next: MobileNavigationState, mode: "push" | "replace" = "push") => {
    const url = buildMobileNavigationUrl(window.location.href, next);
    window.history[mode === "replace" ? "replaceState" : "pushState"]({ oliviaMobile: true }, "", url);
    setNavigation(next);
  }, []);

  const openOlivia = useCallback((target: MobileOliviaTarget | null, from?: MobileNavigationState) => {
    chatReturnRef.current = from || navigation;
    setOliviaTarget(target);
    navigate({ view: "chat" });
  }, [navigate, navigation]);

  const navigatePrimary = useCallback((view: MobilePrimaryView) => {
    if (view === "chat") {
      const labels: Partial<Record<MobilePrimaryView, string>> = {
        home: "홈", clients: "고객관리", calendar: "일정", "person-select": "사진선택",
        bridge: "Bridge", "photo-workspace": "사진작업실", "video-workspace": "영상작업실",
        documents: "문서", conti: "촬영 콘티", prompter: "프롬프터",
      };
      const currentView = navigation.view === "preview" ? "documents" : navigation.view;
      openOlivia({ source: "screen", title: labels[currentView as MobilePrimaryView] || "현재 화면" });
      return;
    }
    // 하단 메뉴의 일반 진입은 새 목록/기능 화면이다. 이전 고객·문서 문맥을 상속하지 않는다.
    useOliviaContextStore.getState().clearWindowLink();
    navigate({ view });
  }, [navigate, navigation.view, openOlivia]);

  const openDocuments = useCallback((section: MobileDocumentsSection) => {
    setDocumentsSection(section);
    navigate({ view: "documents" });
  }, [navigate]);

  const closePreview = useCallback(() => {
    if (window.history.state?.oliviaMobile) window.history.back();
    else navigate({ view: "documents" }, "replace");
  }, [navigate]);

  const closeOlivia = useCallback(() => {
    if (window.history.state?.oliviaMobile) window.history.back();
    else navigate(chatReturnRef.current, "replace");
  }, [navigate]);

  const screenFor = (state: MobileNavigationState) => {
    if (state.view === "preview") return <MobileResourcePreview resource={state} onRequestEdit={(target) => openOlivia(target, state)} onClose={closePreview} />;
    if (state.view === "home") return <MobileHome onNavigate={navigatePrimary} onOpenDocuments={openDocuments} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />;
    if (state.view === "calendar") return <MobileCalendar />;
    if (state.view === "memo") return <MobileMemo />;
    if (state.view === "clients") return <MobileClients
      initialClientId={state.targetId || null}
      initialWorkflowRunId={state.workflowRunId || null}
      onClientChange={(clientId) => navigate({ view: "clients", ...(clientId ? { targetId: clientId } : {}) }, "replace")}
      onWorkflowRunChange={(workflowRunId) => navigate({ view: "clients", ...(state.targetId ? { targetId: state.targetId } : {}), ...(workflowRunId ? { workflowRunId } : {}) }, "replace")}
      onOpenPreview={(resource) => navigate({ view: "preview", ...resource })}
      onOpenConti={(runId) => navigate({ view: "conti", targetId: runId })}
      onOpenPersonSelect={(eventId) => navigate({ view: "person-select", targetId: eventId })}
    />;
    if (state.view === "conti") return <MobileContiFieldView initialRunId={state.targetId || null} onRunChange={(runId) => navigate({ view: "conti", ...(runId ? { targetId: runId } : {}) }, "replace")} onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "person-select") return <MobilePersonSelect initialEventId={state.targetId || null} onEventChange={(eventId) => navigate({ view: "person-select", ...(eventId ? { targetId: eventId } : {}) }, "replace")} onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "all-apps") return <MobileAllApps onNavigate={navigatePrimary} onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "bridge") return <MobileBridgeStatus onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "voice") return <MobileVoice />;
    if (state.view === "photo-workspace") return <MobilePhotoWorkspace onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "video-workspace") return <MobileVideoWorkspace onRequestOlivia={(target) => openOlivia(target, state)} />;
    if (state.view === "prompter") return <MobilePrompter />;
    if (state.view === "photo-pending") return <MobilePhotoPending onBack={() => navigate({ view: "home" })} />;
    if (state.view === "documents") return <MobileDocuments initialSection={documentsSection} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />;
    return <MobileOliviaChat target={oliviaTarget} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} onClose={closeOlivia} />;
  };

  return (
    <OliviaUiSurfaceProvider value="mobile">
      <main className={styles.shell} data-olivia-mobile-shell>
        <div className={styles.viewport}>
          {/* key로 view가 바뀔 때 바운더리를 새로 마운트한다 — 한 화면에서 난 에러가 다른
              화면으로 넘어간 뒤에도 남아있지 않게 한다. */}
          <MobileErrorBoundary key={navigation.view} onGoHome={() => navigate({ view: "home" }, "replace")}>
            {screenFor(navigation)}
          </MobileErrorBoundary>
        </div>
        {/* 문서 미리보기는 자체 하단 작업줄을, 채팅은 작성창과 닫기 버튼을 사용한다. 나머지
            주요 화면은 동일한 하단 탭으로 이동한다. */}
        {navigation.view === "preview" || navigation.view === "chat" ? null : (
          <MobileBottomNav activeView={primaryViewForNavigation(navigation)} onNavigate={navigatePrimary} />
        )}
        <GlobalRecordingBar
          surface="mobile"
          dockVisible={navigation.view !== "preview" && navigation.view !== "chat"}
          bottomOffset={navigation.view === "preview" ? 62 : 0}
          showWhenIdle={navigation.view === "voice"}
          onOpenRecording={() => navigate({ view: "voice" })}
        />
      </main>
    </OliviaUiSurfaceProvider>
  );
}
