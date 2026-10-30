"use client";

import { useEffect } from "react";
import { CircleHelp } from "lucide-react";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import styles from "./OliviaDesktop.module.css";

export type DesktopOverlayKind = "help" | null;

export function DesktopSystemOverlay({ kind, onClose }: { kind: DesktopOverlayKind; onClose: () => void }) {
  useEffect(() => {
    if (!kind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, onClose]);

  if (!kind) return null;

  return (
    <div className={styles.systemPopoverBackdrop} onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className={styles.systemPopover} aria-label="도움말">
        <header>
          <span><CircleHelp size={15} /></span>
          <div><strong>Olivia OS 도움말</strong><small>화면 이동과 Olivia 사용 안내</small></div>
          <ModalCloseButton onClick={onClose} />
        </header>
        <dl className={styles.helpList}>
          <div><dt>앱 열기</dt><dd>아래 Dock 또는 ⌘K로 이동</dd></div>
          <div><dt>뒤로·앞으로</dt><dd>⌘[ · ⌘] 또는 위쪽 화살표 버튼</dd></div>
          <div><dt>Olivia</dt><dd>오른쪽 위 말풍선 버튼으로 현재 화면 전용 대화 열기</dd></div>
        </dl>
      </section>
    </div>
  );
}
