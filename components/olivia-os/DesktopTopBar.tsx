"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { getDockApps, getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import type { DesktopOverlayKind } from "./DesktopSystemOverlay";
import styles from "./OliviaDesktop.module.css";

type MenuKey = "파일" | "편집" | "보기" | "이동" | "도구" | "도움말";
const MENU_LABELS: MenuKey[] = ["파일", "편집", "보기", "이동", "도구", "도움말"];

export function DesktopTopBar({ activeAppTitle, onOpenOverlay }: {
  activeAppTitle: string | null;
  onOpenOverlay: (kind: DesktopOverlayKind) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const closeWindow = useOliviaDesktopStore((state) => state.closeWindow);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);

  useEffect(() => {
    setNow(new Date());
    setOnline(navigator.onLine);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [openMenu]);

  const launch = (appId: string) => {
    const app = getOliviaApp(appId);
    if (!app) return;
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height });
    setOpenMenu(null);
  };

  const overlay = (kind: Exclude<DesktopOverlayKind, null>) => {
    setOpenMenu(null);
    onOpenOverlay(kind);
  };

  const renderMenu = () => {
    if (!openMenu) return null;
    if (openMenu === "파일") return <>
      <button type="button" onClick={() => launch("all-apps")}>모든 앱 열기</button>
      <span className={styles.menuDivider} />
      <button type="button" disabled={!activeWindowId} onClick={() => { if (activeWindowId) closeWindow(activeWindowId); setOpenMenu(null); }}>활성 창 닫기 <kbd>⌘W</kbd></button>
    </>;
    if (openMenu === "편집") return <button type="button" disabled>편집 명령은 활성 앱에서 사용</button>;
    if (openMenu === "보기") return <>
      <button type="button" onClick={() => { toggleShowDesktop(); setOpenMenu(null); }}>바탕화면 보기</button>
      <button type="button" onClick={() => overlay("wallpaper")}>배경화면 변경</button>
    </>;
    if (openMenu === "이동") return <>
      {getDockApps().map((app) => (
        <button type="button" key={app.id} onClick={() => launch(app.id)}>{app.title}</button>
      ))}
    </>;
    if (openMenu === "도구") return <>
      <button type="button" onClick={() => launch("memo")}>메모 열기</button>
      <button type="button" onClick={() => launch("today")}>오늘 열기</button>
      <button type="button" onClick={() => launch("olivia-chat")}>Olivia 열기</button>
      <button type="button" onClick={() => launch("all-apps")}>모든 앱</button>
    </>;
    return <button type="button" onClick={() => overlay("help")}>Olivia OS 사용법</button>;
  };

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>
        <span className={styles.topBarBrandMark}><Sparkles size={13} /></span>
        <span className={styles.topBarBrand}>Olivia</span>
        <div className={styles.menuBar} role="menubar" aria-label="시스템 메뉴" ref={menuRef}>
          {MENU_LABELS.map((label) => (
            <div className={styles.menuBarGroup} key={label}>
              <button type="button" className={`${styles.menuBarItem} ${openMenu === label ? styles.menuBarItemOpen : ""}`} role="menuitem" aria-haspopup="menu" aria-expanded={openMenu === label} onClick={() => setOpenMenu((current) => current === label ? null : label)}>
                {label}
              </button>
              {openMenu === label ? <div className={styles.menuDropdown} role="menu">{renderMenu()}</div> : null}
            </div>
          ))}
        </div>
        {activeAppTitle ? <span className={styles.topBarActiveTitle}><span className={styles.topBarActiveTitleDot}>·</span>{activeAppTitle}</span> : null}
      </div>
      <div className={styles.topBarRight}>
        {online !== null ? <span className={styles.topBarStatus}><span className={`${styles.topBarStatusDot} ${!online ? styles.topBarStatusDotOffline : ""}`} />{online ? "온라인" : "오프라인"}</span> : null}
        {now ? <span className={styles.topBarClock}>{now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
      </div>
    </div>
  );
}
