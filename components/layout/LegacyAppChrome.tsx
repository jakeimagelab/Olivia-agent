"use client";

import { useEffect, useState, type ReactNode } from "react";
import BackgroundJobsWidget from "@/components/olivia/BackgroundJobsWidget";
import PhotoStudioBackgroundJobBridge from "@/components/photo-workspace/PhotoStudioBackgroundJobBridge";
import CursorEffect from "@/components/CursorEffect";
import GlobalClientContextBridge from "@/components/GlobalClientContextBridge";
import GlobalFeatureSidebar from "@/components/GlobalFeatureSidebar";
import OliviaPageTransition from "@/components/olivia/OliviaPageTransition";
import OliviaSplash from "@/components/home/OliviaSplash";
import OliviaWorkspaceShell from "@/components/olivia/OliviaWorkspaceShell";

/** @deprecated Compatibility chrome for standalone legacy routes. OLIVIA OS owns the `/` experience. */
export default function LegacyAppChrome({ children }: { children: ReactNode }) {
  // `null` 동안은 전역 watcher를 마운트하지 않는다. iframe 첫 commit에서 false로 시작하면
  // effect가 embedded를 판별하기 전에 bridge가 한 번 요청을 보내 중복 polling이 생긴다.
  const [embedded, setEmbedded] = useState<boolean | null>(null);

  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get("oliviaEmbedded") === "1");
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button || button.disabled) return;

      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const ripple = document.createElement("span");
      ripple.className = "pc-ripple";
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px;`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 600);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <>
      <OliviaSplash />
      <CursorEffect />
      <div className="olivia-app-row">
        <div className="olivia-app-main">
          <GlobalFeatureSidebar>
            <GlobalClientContextBridge />
            <OliviaPageTransition>{children}</OliviaPageTransition>
          </GlobalFeatureSidebar>
        </div>
        <OliviaWorkspaceShell />
        {/* Olivia OS iframe 안에서는 바깥 adaptive root가 전역 watcher/widget를 이미 소유한다. */}
        {embedded === false ? <PhotoStudioBackgroundJobBridge /> : null}
        {embedded === false ? <BackgroundJobsWidget /> : null}
      </div>
    </>
  );
}
