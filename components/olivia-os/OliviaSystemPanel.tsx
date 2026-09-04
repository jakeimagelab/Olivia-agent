"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopEffectiveActiveApp } from "./useOliviaDesktopEffectiveActiveApp";
import styles from "./OliviaDesktop.module.css";

const COLLAPSED_KEY = "olivia-os-assistant-collapsed-v1";

export function OliviaSystemPanel() {
  const effectiveApp = useOliviaDesktopEffectiveActiveApp();
  const activeClientName = useOliviaContextStore((state) => state.activeClientName);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1"); } catch { /* optional preference */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* optional preference */ }
      return next;
    });
  };

  const activeTitle = effectiveApp ? getOliviaApp(effectiveApp.appId)?.title : undefined;
  const contextLabel = [activeTitle, activeClientName].filter(Boolean).join(" · ") || "Desktop";

  return (
    <aside className={`${styles.assistantPanel} ${collapsed ? styles.assistantCollapsed : ""}`} aria-label="Olivia System Assistant">
      <header className={styles.assistantHeader}>
        <span className={styles.assistantMark}><Sparkles size={14} /></span>
        <span className={styles.assistantIdentity}>
          <strong>Olivia</strong>
          <small>System Assistant</small>
        </span>
        <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Olivia 펼치기" : "Olivia 접기"}>
          {collapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </header>
      <div className={styles.assistantContext} title={contextLabel}>
        <span>CONTEXT</span>
        <strong>{contextLabel}</strong>
      </div>
      <div className={styles.assistantConversation} aria-hidden={collapsed}>
        <OliviaChatDockTarget
          id="desktop-system"
          priority={60}
          className={`${styles.assistantChatDock} olivia-os-chat-dock`}
        />
      </div>
      {collapsed ? <span className={styles.assistantRailLabel}>OLIVIA</span> : null}
    </aside>
  );
}
