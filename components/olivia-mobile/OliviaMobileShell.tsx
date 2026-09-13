"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import MobileBottomNav from "./MobileBottomNav";
import MobileHome from "./MobileHome";
import MobileCalendar from "./MobileCalendar";
import MobileMemo from "./MobileMemo";
import MobileDocuments, { type MobileDocumentsSection } from "./MobileDocuments";
import MobileOliviaChat from "./MobileOliviaChat";
import MobileResourcePreview from "./MobileResourcePreview";
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
        : navigation.view === "documents"
          ? <MobileDocuments initialSection={documentsSection} onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />
          : <MobileOliviaChat onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} />;

  return (
    <main className={styles.shell} data-olivia-mobile-shell>
      <div className={styles.viewport}>{screen}</div>
      {navigation.view === "preview" ? null : (
        <MobileBottomNav activeView={primaryViewForNavigation(navigation)} onNavigate={navigatePrimary} />
      )}
    </main>
  );
}
