"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import OliviaChatDockTarget from "@/components/olivia/OliviaChatDockTarget";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import styles from "./OliviaMobileShell.module.css";

export default function MobileOliviaChat({
  target,
  onOpenPreview,
  onClose,
}: {
  target: MobileOliviaTarget | null;
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const startNewConversation = useOliviaConversationStore((state) => state.startNewConversation);
  const [newConversationBusy, setNewConversationBusy] = useState(false);
  const [newConversationError, setNewConversationError] = useState("");

  useEffect(() => {
    const store = useOliviaContextStore.getState();
    // 화면에서 명시적으로 받은 대상만 채팅 문맥으로 쓴다. 이전 고객·촬영 건은 먼저 지운다.
    store.clearWindowLink();
    if (!target) return;
    const resourceId = target.documentId || target.eventId || target.bridgeSelectionId;
    store.setWorkspace(target.source, resourceId);
    if (target.documentId) {
      store.setCurrentDocument(target.documentId, target.documentType || target.source, target.title, {
        clientId: target.clientId,
        clientName: target.clientName,
        projectId: target.workflowRunId,
        projectName: target.title,
      });
    } else if (target.clientId || target.workflowRunId) {
      store.setContextLink({ clientId: target.clientId, clientName: target.clientName, projectId: target.workflowRunId, projectName: target.title });
    }
    if (target.sceneId) store.setSelectedScene(target.sceneId);
  }, [target]);

  const createConversation = async () => {
    if (newConversationBusy) return;
    setNewConversationBusy(true);
    setNewConversationError("");
    try {
      await startNewConversation();
    } catch (error) {
      setNewConversationError(error instanceof Error ? error.message : "새 대화를 만들지 못했어요.");
    } finally {
      setNewConversationBusy(false);
    }
  };

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
      <button type="button" className={styles.chatNewConversation} onClick={() => void createConversation()} disabled={newConversationBusy} aria-label="새 대화 시작"><MessageSquarePlus size={17} /><span>{newConversationBusy ? "준비 중" : "새 대화"}</span></button>
      {newConversationError ? <div className={styles.chatActionError} role="alert">{newConversationError}</div> : null}
      <div className={styles.mobileChatTarget}><small>현재 대상</small><strong>{target?.title || "홈"}</strong></div>
      <OliviaChatDockTarget id="mobile-os" priority={70} className={styles.chatDock} />
    </section>
  );
}
