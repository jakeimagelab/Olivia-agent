"use client";

import { ChevronRight } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { visibleMobileCapabilities, type MobileAppGroup } from "@/lib/olivia/mobile/appCapabilities";
import type { MobileOliviaTarget, MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

const GROUPS: Array<{ id: MobileAppGroup; label: string }> = [
  { id: "manage", label: "관리" },
  { id: "photo", label: "사진" },
  { id: "document", label: "문서" },
  { id: "video", label: "영상" },
  { id: "other", label: "기타" },
];

export default function MobileAllApps({ onNavigate, onRequestOlivia }: { onNavigate: (view: MobilePrimaryView) => void; onRequestOlivia: (target: MobileOliviaTarget) => void }) {
  const capabilities = visibleMobileCapabilities();
  return <section className={`${styles.screenWithHeader} ${styles.mobileAllApps}`} aria-label="모바일 전체 기능">
    <div className={styles.mobilePageHeading}><div><small>Olivia OS</small><h1>전체 기능</h1></div></div>
    <div className={styles.mobileAllAppsBody}>{GROUPS.map((group) => {
      const items = capabilities.filter((item) => item.group === group.id && item.mobileView);
      if (!items.length) return null;
      return <section key={group.id} className={styles.mobileAppGroup}>
        <h2>{group.label}</h2>
        <div className={styles.mobileAppGrid}>{items.map((item) => <button type="button" key={item.appId} onClick={() => item.mobileView === "chat" ? onRequestOlivia({ source: "screen", title: item.title }) : onNavigate(item.mobileView!)}>
          <span className={styles.mobileAppIcon}><AppIcon name={item.iconName} size={28} /></span>
          <span><strong>{item.title}</strong><small>{item.description}</small></span>
          <ChevronRight size={17} />
        </button>)}</div>
      </section>;
    })}</div>
  </section>;
}
