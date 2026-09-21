"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { resolveOliviaSurface, type OliviaSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import { detectOliviaDevice } from "@/lib/device/detectDevice";
import { PhotoProjectNotificationProvider } from "@/components/photo-storage/PhotoProjectNotificationProvider";
import PhotoProjectNotification from "@/components/photo-storage/PhotoProjectNotification";
import PhotoStudioBackgroundJobBridge from "@/components/photo-workspace/PhotoStudioBackgroundJobBridge";
import BackgroundJobsWidget from "@/components/olivia/BackgroundJobsWidget";
import { BackupReadyNotifications } from "@/components/olivia-os/BackupReadyNotifications";
import styles from "./OliviaAdaptiveRoot.module.css";

const OliviaDesktop = dynamic(() => import("@/components/olivia-os/OliviaDesktop"), {
  loading: () => <SurfaceLoading />,
});
const OliviaMobileShell = dynamic(() => import("./OliviaMobileShell"), {
  ssr: false,
  loading: () => <SurfaceLoading />,
});
const OliviaTabletShell = dynamic(() => import("@/components/olivia-tablet/OliviaTabletShell"), {
  ssr: false,
  loading: () => <SurfaceLoading />,
});

function SurfaceLoading() {
  return <main className={styles.loading} aria-label="Olivia를 여는 중"><span /></main>;
}

function readSurface(): OliviaSurface {
  const params = new URLSearchParams(window.location.search);
  const previewEnabled = process.env.NODE_ENV !== "production";
  return resolveOliviaSurface({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    forceMobilePreview: previewEnabled && params.get("mobilePreview") === "1",
    forceTabletPreview: previewEnabled && params.get("tabletPreview") === "1",
    // docs/tablet-ipad-home-memo-voice-spec.md §1.1 — 세로모드 iPad Pro 11"를 포함한
    // 대부분의 iPad가 폭 휴리스틱만으로는 tablet이 아니라 mobile로 잘못 분류됐다.
    deviceType: detectOliviaDevice(),
  });
}

export default function OliviaAdaptiveRoot() {
  const [surface, setSurface] = useState<OliviaSurface | null>(null);

  useEffect(() => {
    const viewportQuery = window.matchMedia("(max-width: 820px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setSurface(readSurface());
    update();
    viewportQuery.addEventListener("change", update);
    coarseQuery.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      viewportQuery.removeEventListener("change", update);
      coarseQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("olivia-mobile-os", surface === "mobile");
    document.documentElement.classList.toggle("olivia-tablet-os", surface === "tablet");
    return () => {
      document.documentElement.classList.remove("olivia-mobile-os");
      document.documentElement.classList.remove("olivia-tablet-os");
    };
  }, [surface]);

  if (!surface) return <SurfaceLoading />;
  return (
    <PhotoProjectNotificationProvider>
      <PhotoStudioBackgroundJobBridge />
      <PhotoProjectNotification />
      <BackgroundJobsWidget />
      {/* 코드 요청서(2026-09-19) 작업 A — OliviaDesktop 안에서만 마운트되면 mobile/tablet
          surface에서는 아예 렌더링되지 않는다. PhotoProjectNotification과 같은 레벨(surface
          분기 밖)로 올려서 로그인한 사용자가 어떤 화면에 있든 뜨게 한다. */}
      <Suspense fallback={null}>
        <BackupReadyNotifications />
      </Suspense>
      {surface === "mobile" ? <OliviaMobileShell /> : surface === "tablet" ? <OliviaTabletShell /> : <OliviaDesktop />}
    </PhotoProjectNotificationProvider>
  );
}
