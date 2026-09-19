"use client";

import { useEffect, useRef } from "react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import MobileHeader from "./MobileHeader";
import styles from "./OliviaMobileShell.module.css";

export default function MobileOliviaChat({
  onOpenPreview,
  onBack,
}: {
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
  onBack: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onOpenResource = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      const type = detail?.resourceType;
      const id = detail?.resourceId;
      if ((type === "quote" || type === "contract" || type === "document" || type === "storyboard") && typeof id === "string" && id) {
        onOpenPreview({ resourceType: type, resourceId: id, temporaryDocumentId: typeof detail.temporaryDocumentId === "string" ? detail.temporaryDocumentId : undefined });
      }
    };
    window.addEventListener("olivia-mobile-open-resource", onOpenResource);
    return () => window.removeEventListener("olivia-mobile-open-resource", onOpenResource);
  }, [onOpenPreview]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;
    const resize = () => root.style.setProperty("--mobile-chat-height", `${viewport.height}px`);
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);

  return (
    <section ref={rootRef} className={`${styles.screenWithHeader} ${styles.chatScreen}`} aria-label="올리비아 채팅">
      {/* 코드 요청서(2026-09-19) 작업 B — 독을 숨기는 대신 헤더에 뒤로가기를 둔다("앱 전환은
          상단에서"). 부제는 대화 영역을 한 줄만큼이라도 더 확보하려고 뺀다. */}
      <MobileHeader title="올리비아 채팅" onBack={onBack} />
      <OliviaChatDockTarget id="mobile-os" priority={70} className={styles.chatDock} />
    </section>
  );
}

