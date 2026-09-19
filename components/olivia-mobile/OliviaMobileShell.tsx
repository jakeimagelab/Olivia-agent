"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { MobileErrorBoundary } from "./MobileErrorBoundary";
import MobileBottomNav from "./MobileBottomNav";
import MobileHome from "./MobileHome";
import MobileCalendar from "./MobileCalendar";
import MobileMemo from "./MobileMemo";
import MobileDocuments, { type MobileDocumentsSection } from "./MobileDocuments";
import MobileOliviaChat from "./MobileOliviaChat";
import MobileResourcePreview from "./MobileResourcePreview";
import { OliviaUiSurfaceProvider } from "@/lib/olivia/surfaceContext";
import {
  buildMobileNavigationUrl,
  parseMobileNavigation,
  primaryViewForNavigation,
  type MobileNavigationState,
  type MobilePrimaryView,
} from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

const MobileVoice = dynamic(() => import("./MobileVoice"), {
  loading: () => <div className={styles.mobileFeatureLoading}>음성 기록을 준비하고 있어요...</div>,
});
const MobilePhotoWorkspace = dynamic(() => import("./MobilePhotoWorkspace"), {
  loading: () => <div className={styles.mobileFeatureLoading}>사진작업실을 준비하고 있어요...</div>,
});

function currentNavigation(): MobileNavigationState {
  return typeof window === "undefined" ? { view: "home" } : parseMobileNavigation(window.location.search);
}

export default function OliviaMobileShell() {
  const [navigation, setNavigation] = useState<MobileNavigationState>(currentNavigation);
  const [documentsSection, setDocumentsSection] = useState<MobileDocumentsSection>("quote-contract");

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onPopState = () => setNavigation(currentNavigation());
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const navigate = useCallback((next: MobileNavigationState, mode: "push" | "replace" = "push") => {
    const url = buildMobileNavigationUrl(window.location.href, next);
    window.history[mode === "replace" ? "replaceState" : "pushState"]({ oliviaMobile: true }, "", url);
    setNavigation(next);
  }, []);

  const navigatePrimary = useCallback((view: MobilePrimaryView) => {
    navigate({ view });
  }, [navigate]);

  const openDocuments = useCallback((section: MobileDocumentsSection) => {
    setDocumentsSection(section);
    navigate({ view: "documents" });
  }, [navigate]);

  let screen;
  if (navigation.view === "preview") {
    screen = <MobileResourcePreview resource={navigation} onBack={() => window.history.back()} onRequestEdit={() => navigate({ view: "chat" })} />;
  } else screen = navigation.view === "home"
    ? <MobileHome onNavigate={navigatePrimary} onOpenDocuments={openDocuments} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />
    : navigation.view === "calendar"
      ? <MobileCalendar />
      : navigation.view === "memo"
        ? <MobileMemo />
        : navigation.view === "voice"
          ? <MobileVoice onBack={() => navigate({ view: "home" }, "replace")} />
        : navigation.view === "photo-workspace"
          ? <MobilePhotoWorkspace onBack={() => navigate({ view: "home" }, "replace")} />
        : navigation.view === "documents"
          ? <MobileDocuments initialSection={documentsSection} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />
          : <MobileOliviaChat onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />;

  return (
    <OliviaUiSurfaceProvider value="mobile">
      <main className={styles.shell} data-olivia-mobile-shell>
        <div className={styles.viewport}>
          {/* key로 view가 바뀔 때 바운더리를 새로 마운트한다 — 한 화면에서 난 에러가 다른
              화면으로 넘어간 뒤에도 남아있지 않게 한다. */}
          <MobileErrorBoundary key={navigation.view} onGoHome={() => navigate({ view: "home" }, "replace")}>
            {screen}
          </MobileErrorBoundary>
        </div>
        {/* 코드 요청서(2026-09-19) 작업 B — 채팅이 열려 있는 동안은 독을 숨긴다. chatDock의
            padding-bottom(calc(80px+safe-area))이 독을 피하려고 남겨둔 공간이었는데, 독 자체를
            숨기면 그 공간이 고스란히 메시지 영역으로 돌아온다. 앱 전환은 헤더의 뒤로가기로
            홈에 돌아가서 한다(다른 화면들과 동일한 패턴, MobileResourcePreview도 같은 이유로
            독을 숨긴다). */}
        {navigation.view === "preview" || navigation.view === "chat" ? null : (
          <MobileBottomNav activeView={primaryViewForNavigation(navigation)} onNavigate={navigatePrimary} />
        )}
      </main>
    </OliviaUiSurfaceProvider>
  );
}
