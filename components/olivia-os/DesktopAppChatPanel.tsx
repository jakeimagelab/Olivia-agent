"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, MessageCircle, Plus } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import styles from "./OliviaDesktop.module.css";

export function DesktopAppChatPanel({ open, screenTitle, onClose }: { open: boolean; screenTitle: string; onClose: () => void }) {
  const startNewConversation = useOliviaConversationStore((state) => state.startNewConversation);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const restoreFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (restoreFrameRef.current !== null) {
        cancelAnimationFrame(restoreFrameRef.current);
        restoreFrameRef.current = null;
      }
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!open && wasOpenRef.current) {
      const opener = openerRef.current;
      restoreFrameRef.current = requestAnimationFrame(() => {
        restoreFrameRef.current = null;
        if (!opener?.isConnected) return;
        opener.focus();
      });
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => () => {
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current);
  }, []);

  return (
    <aside className={styles.appChatPanel} data-open={open} aria-hidden={!open} inert={open ? undefined : true} aria-label="전체 Olivia">
      <header className={styles.appChatHeader}>
        <span className={styles.appChatMark}><MessageCircle size={17} /></span>
        <span><strong>Olivia</strong><small>전체</small></span>
        <button type="button" onClick={() => void startNewConversation()} aria-label="새 대화"><Plus size={16} /></button>
        <button type="button" onClick={onClose} aria-label="Olivia 닫기"><ChevronRight size={19} /></button>
      </header>
      <div className={styles.appChatScope}>지금 보는 화면 · <strong>{screenTitle}</strong> — 여기선 뭐든 시킬 수 있습니다.</div>
      <OliviaChatDockTarget id="desktop-panel" priority={95} className={styles.appChatDock} />
    </aside>
  );
}
