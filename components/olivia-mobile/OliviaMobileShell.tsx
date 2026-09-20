"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

const SWIPEABLE_PRIMARY_VIEWS = ["home", "calendar", "memo", "documents"] as const satisfies readonly MobilePrimaryView[];
type SwipeablePrimaryView = typeof SWIPEABLE_PRIMARY_VIEWS[number];
const IOS_BACK_GESTURE_EDGE_PX = 24;
const SWIPE_DISTANCE_PX = 68;

function isSwipeablePrimaryView(view: MobileNavigationState["view"]): view is SwipeablePrimaryView {
  return (SWIPEABLE_PRIMARY_VIEWS as readonly string[]).includes(view);
}

function isMobileSwipeLocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return true;
  if (target.closest("[data-mobile-swipe-lock]")) return true;
  let current: Element | null = target;
  while (current) {
    if (current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && current.scrollWidth > current.clientWidth) return true;
    }
    current = current.parentElement;
  }
  return false;
}

export default function OliviaMobileShell() {
  const [navigation, setNavigation] = useState<MobileNavigationState>(currentNavigation);
  const [documentsSection, setDocumentsSection] = useState<MobileDocumentsSection>("quote-contract");
  const swipeRef = useRef<{ pointerId: number; view: SwipeablePrimaryView; startX: number; startY: number; locked: boolean } | null>(null);

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

  const onSwipePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !isSwipeablePrimaryView(navigation.view)) return;
    // iOS의 왼쪽 가장자리 뒤로가기 제스처와 경쟁하지 않는다.
    if (event.clientX <= IOS_BACK_GESTURE_EDGE_PX) return;
    swipeRef.current = {
      pointerId: event.pointerId,
      view: navigation.view,
      startX: event.clientX,
      startY: event.clientY,
      locked: isMobileSwipeLocked(event.target),
    };
  }, [navigation.view]);

  const onSwipePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.locked) return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (Math.abs(deltaX) < SWIPE_DISTANCE_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    const currentIndex = SWIPEABLE_PRIMARY_VIEWS.indexOf(swipe.view);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= SWIPEABLE_PRIMARY_VIEWS.length) return;
    navigate({ view: SWIPEABLE_PRIMARY_VIEWS[nextIndex] });
  }, [navigate]);

  const clearSwipe = useCallback(() => { swipeRef.current = null; }, []);

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
          : <MobileOliviaChat onOpenPreview={(resource) => navigate({ view: "preview", ...resource })} onClose={() => navigate({ view: "home" }, "replace")} />;

  return (
    <OliviaUiSurfaceProvider value="mobile">
      <main className={styles.shell} data-olivia-mobile-shell>
        <div className={styles.viewport} onPointerDown={onSwipePointerDown} onPointerUp={onSwipePointerUp} onPointerCancel={clearSwipe}>
          {/* key로 view가 바뀔 때 바운더리를 새로 마운트한다 — 한 화면에서 난 에러가 다른
              화면으로 넘어간 뒤에도 남아있지 않게 한다. */}
          <MobileErrorBoundary key={navigation.view} onGoHome={() => navigate({ view: "home" }, "replace")}>
            {screen}
          </MobileErrorBoundary>
        </div>
        {/* 문서 미리보기는 자체 하단 작업줄을, 채팅은 작성창과 닫기 버튼을 사용한다. 나머지
            주요 화면은 동일한 하단 탭으로 이동한다. */}
        {navigation.view === "preview" || navigation.view === "chat" ? null : (
          <MobileBottomNav activeView={primaryViewForNavigation(navigation)} onNavigate={navigatePrimary} />
        )}
      </main>
    </OliviaUiSurfaceProvider>
  );
}
