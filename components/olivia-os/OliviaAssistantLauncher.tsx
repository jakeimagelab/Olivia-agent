"use client";

import { MessageCircle } from "lucide-react";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";
import { getOliviaApp } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import styles from "./OliviaDesktop.module.css";

export function OliviaAssistantLauncher() {
  const win = useOliviaDesktopStore((state) => state.windows["olivia-chat"]);
  const openApp = useOliviaDesktopStore((state) => state.openApp);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);

  if (win && !win.minimized) return null;

  const open = () => {
    if (win?.minimized) { restoreWindow(win.id); return; }
    const app = getOliviaApp("olivia-chat");
    if (!app) return;
    openApp({ appId: app.id, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height, placement: "right" });
  };

  return (
    <button type="button" className={styles.oliviaLauncher} onClick={open} aria-label="Olivia 열기" title="Olivia 열기">
      <span><OliviaIcon size={25} /></span>
      <MessageCircle size={13} aria-hidden="true" />
    </button>
  );
}
