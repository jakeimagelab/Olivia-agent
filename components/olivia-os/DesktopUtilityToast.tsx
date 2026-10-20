"use client";

import { useEffect } from "react";
import { CircleAlert, Info } from "lucide-react";
import { useOliviaDesktopUtilityStore } from "@/lib/store/useOliviaDesktopUtilityStore";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import styles from "./OliviaDesktop.module.css";

export function DesktopUtilityToast() {
  const notice = useOliviaDesktopUtilityStore((state) => state.notice);
  const clearNotice = useOliviaDesktopUtilityStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => clearNotice(notice.id), 4_500);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice]);

  if (!notice) return null;
  const Icon = notice.tone === "error" ? CircleAlert : Info;
  return (
    <div className={styles.desktopUtilityToast} data-tone={notice.tone} role="status">
      <Icon size={16} aria-hidden="true" />
      <span>{notice.message}</span>
      <ModalCloseButton className={styles.desktopUtilityToastClose} onClick={() => clearNotice(notice.id)} />
    </div>
  );
}
