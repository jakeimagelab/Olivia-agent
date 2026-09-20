"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

export default function MobileOliviaChat({
  onOpenPreview,
  onClose,
}: {
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
  onClose: () => void;
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
    if (!root) return;

    let layoutFrame: number | null = null;
    let scrollFrame: number | null = null;
    const scrollToLatestMessage = () => {
      const messageList = root.querySelector<HTMLElement>(".olivia-conversation__messages");
      messageList?.scrollTo({ top: messageList.scrollHeight, behavior: "auto" });
    };
    const updateLayout = () => {
      layoutFrame = null;
      const height = Math.round(viewport?.height || window.innerHeight);
      const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
      // iOS 키보드 전환에도 visual viewport의 실제 높이와 위치를 그대로 적용한다.
      root.style.setProperty("--mobile-chat-height", `${height}px`);
      root.style.setProperty("--mobile-chat-offset-top", `${offsetTop}px`);
      if (scrollFrame != null) cancelAnimationFrame(scrollFrame);
      // 높이가 적용된 다음 프레임에 마지막 대화를 맞춘다. 키보드 전환 중에도 마지막 메시지와
      // 작성창이 같은 visual viewport 안에 남는다.
      scrollFrame = requestAnimationFrame(scrollToLatestMessage);
    };
    const scheduleLayout = () => {
      if (layoutFrame == null) layoutFrame = requestAnimationFrame(updateLayout);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLTextAreaElement) scheduleLayout();
    };

    scheduleLayout();
    viewport?.addEventListener("resize", scheduleLayout);
    viewport?.addEventListener("scroll", scheduleLayout, { passive: true });
    window.addEventListener("resize", scheduleLayout, { passive: true });
    root.addEventListener("focusin", onFocusIn);
    return () => {
      viewport?.removeEventListener("resize", scheduleLayout);
      viewport?.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      root.removeEventListener("focusin", onFocusIn);
      if (layoutFrame != null) cancelAnimationFrame(layoutFrame);
      if (scrollFrame != null) cancelAnimationFrame(scrollFrame);
    };
  }, []);

  return (
    <section ref={rootRef} className={`${styles.screenWithHeader} ${styles.chatScreen}`} aria-label="올리비아 채팅">
      <button type="button" className={styles.chatClose} onClick={onClose} aria-label="채팅 닫고 홈으로 이동"><X size={19} /></button>
      <OliviaChatDockTarget id="mobile-os" priority={70} className={styles.chatDock} />
    </section>
  );
}
