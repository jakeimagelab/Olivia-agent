"use client";

import { useEffect, type ReactNode } from "react";
import BackgroundJobsWidget from "@/components/olivia/BackgroundJobsWidget";
import CursorEffect from "@/components/CursorEffect";
import GlobalClientContextBridge from "@/components/GlobalClientContextBridge";
import GlobalFeatureSidebar from "@/components/GlobalFeatureSidebar";
import OliviaPageTransition from "@/components/olivia/OliviaPageTransition";
import OliviaSplash from "@/components/home/OliviaSplash";
import OliviaWorkspaceShell from "@/components/olivia/OliviaWorkspaceShell";

/** @deprecated Compatibility chrome for standalone legacy routes. OLIVIA OS owns the `/` experience. */
export default function LegacyAppChrome({ children }: { children: ReactNode }) {
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
        <BackgroundJobsWidget />
      </div>
    </>
  );
}
