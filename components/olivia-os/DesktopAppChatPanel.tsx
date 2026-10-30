"use client";

import { X } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import styles from "./OliviaDesktop.module.css";

export function DesktopAppChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside className={styles.appChatPanel} data-open={open} aria-hidden={!open} aria-label="현재 화면 전용 Olivia">
      <button type="button" className={styles.appChatClose} onClick={onClose} aria-label="Olivia 닫기"><X size={18} /></button>
      <OliviaChatDockTarget id="desktop-panel" priority={95} className={styles.appChatDock} />
    </aside>
  );
}
