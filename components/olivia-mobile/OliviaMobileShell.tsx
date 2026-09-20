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
  const [chatKeyboardOpen, setChatKeyboardOpen] = useState(false);

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

  useEffect(() => {
    // 채팅을 벗어나는 순간 숨겨둔 하단 탭을 항상 원래 위치로 돌린다.
    setChatKeyboardOpen(false);
  }, [navigation.view]);

  let screen;
  if (navigation.view === "preview") {
    screen = <MobileResourcePreview resource={navigation} onRequestEdit={() => navigate({ view: "chat" })} />;
  } else screen = navigation.view === "home"
    ? <MobileHome onNavigate={navigatePrimary} onOpenDocuments={openDocuments} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />
    : navigation.view === "calendar"
      ? <MobileCalendar />
      : navigation.view === "memo"
        ? <MobileMemo />
        : navigation.view === "voice"
          ? <MobileVoice />
        : navigation.view === "photo-workspace"
          ? <MobilePhotoWorkspace />
        : navigation.view === "documents"
          ? <MobileDocuments initialSection={documentsSection} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />
          : <MobileOliviaChat onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} onKeyboardChange={setChatKeyboardOpen} />;

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
        {/* 문서 미리보기는 자체 하단 작업줄을 사용한다. 나머지 화면은 제목 바 대신 동일한
            하단 탭으로 이동한다. 키보드가 열린 채팅에서만 탭을 잠시 내려 입력창을 보존한다. */}
        {navigation.view === "preview" ? null : (
          <MobileBottomNav activeView={primaryViewForNavigation(navigation)} onNavigate={navigatePrimary} keyboardOpen={navigation.view === "chat" && chatKeyboardOpen} />
        )}
      </main>
    </OliviaUiSurfaceProvider>
  );
}
