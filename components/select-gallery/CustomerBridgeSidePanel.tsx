"use client";

import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Images,
  MessageCircle,
  Send,
  Star,
  X,
} from "lucide-react";
import { memo } from "react";
import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";

import { BRIDGE_COLOR_LABELS } from "@/lib/photo-bridge/labels";
import type { PersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";
import { ColorLabels, RatingStars, StablePreviewImage } from "./CustomerBridgeMedia";
import type { CustomerBridgeSideTab } from "./useCustomerBridgeMessages";
import styles from "./CustomerBridgeSelect.module.css";

type QualityReviewStatus = "confirmed_issue" | "confirmed_normal";

export const CustomerBridgeSidePanel = memo(function CustomerBridgeSidePanel({
  sideTab,
  onSideTabChange,
  mobileSideOpen,
  onCloseMobile,
  messagesEnabled,
  unreadMessages,
  activeCount,
  focusedImage,
  orderedIds,
  onFocusImage,
  onOpenFullscreen,
  onImageError,
  quality,
  canManageQuality,
  onReviewQuality,
  readOnly,
  rating,
  colorLabel,
  note,
  onRate,
  onColor,
  onNote,
  messages,
  messageText,
  setMessageText,
  messageState,
  messageImageScoped,
  setMessageImageScoped,
  sendingMessage,
  messagesEndRef,
  onSendMessage,
}: {
  sideTab: CustomerBridgeSideTab;
  onSideTabChange: (tab: CustomerBridgeSideTab) => void;
  mobileSideOpen: boolean;
  onCloseMobile: () => void;
  messagesEnabled: boolean;
  unreadMessages: number;
  activeCount: number;
  focusedImage: CustomerBridgeImage | null;
  orderedIds: string[];
  onFocusImage: (id: string) => void;
  onOpenFullscreen: (id: string) => void;
  onImageError?: (imageId: string) => void;
  quality?: PublicPhotoQualityResult;
  canManageQuality: boolean;
  onReviewQuality: (imageId: string, status: QualityReviewStatus) => void;
  readOnly: boolean;
  rating: number;
  colorLabel: CustomerBridgeColorLabel | null;
  note: string;
  onRate: (rating: 0 | CustomerBridgeRating) => void;
  onColor: (colorLabel: CustomerBridgeColorLabel) => void;
  onNote: (value: string) => void;
  messages: PersonSelectProjectMessage[];
  messageText: string;
  setMessageText: Dispatch<SetStateAction<string>>;
  messageState: string;
  messageImageScoped: boolean;
  setMessageImageScoped: Dispatch<SetStateAction<boolean>>;
  sendingMessage: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSendMessage: () => void;
}) {
  const focusedIndex = focusedImage ? orderedIds.indexOf(focusedImage.id) : -1;
  const previousId = focusedIndex > 0 ? orderedIds[focusedIndex - 1] : null;
  const nextId = focusedIndex >= 0 && focusedIndex < orderedIds.length - 1 ? orderedIds[focusedIndex + 1] : null;

  return (
    <aside className={styles.previewPanel} data-mobile-open={mobileSideOpen || undefined}>
      <nav className={styles.sideTabs} role="tablist" aria-label="오른쪽 패널">
        <button type="button" role="tab" aria-selected={sideTab === "preview"} onClick={() => onSideTabChange("preview")}>미리보기</button>
        {messagesEnabled ? <button type="button" role="tab" aria-selected={sideTab === "chat"} onClick={() => onSideTabChange("chat")}><MessageCircle size={14} />대화{unreadMessages ? <b>{unreadMessages}</b> : null}</button> : null}
        <button type="button" className={styles.mobileSideClose} onClick={onCloseMobile} aria-label="오른쪽 패널 닫기"><X size={16} /></button>
      </nav>
      {sideTab === "preview" ? (
        <div className={styles.previewContent}>
          <header><strong>미리보기</strong><span>{activeCount ? `작업 대상 ${activeCount}장` : focusedImage ? "현재 사진" : "사진을 선택해 주세요"}</span></header>
          {focusedImage ? <>
            <div className={styles.previewCanvas} onDoubleClick={() => onOpenFullscreen(focusedImage.id)}>
              <button type="button" className={`${styles.previewArrow} ${styles.previewArrowLeft}`} onClick={() => previousId && onFocusImage(previousId)} disabled={!previousId} aria-label="이전 사진"><ChevronLeft size={20} /></button>
              <StablePreviewImage image={focusedImage} onImageError={onImageError} />
              <button type="button" className={`${styles.previewArrow} ${styles.previewArrowRight}`} onClick={() => nextId && onFocusImage(nextId)} disabled={!nextId} aria-label="다음 사진"><ChevronRight size={20} /></button>
            </div>
            <div className={styles.previewMeta}><strong>{focusedImage.original_file_name}</strong><span>{focusedImage.relative_path ?? ""}</span><button type="button" onClick={() => onOpenFullscreen(focusedImage.id)}><Expand size={13} /> 크게 보기</button></div>
            {quality ? <section className={styles.qualityPanel}>
              <header><strong>AI 품질 분석</strong><span>{quality.reviewStatus === "confirmed_normal" ? "정상 확인됨" : quality.reviewStatus === "confirmed_issue" ? "문제 확인됨" : "검토 보조"}</span></header>
              {(["eyes_closed", "face_too_dark", "motion_blur"] as const).map((flag) => <div key={flag} data-suspected={quality.flags.includes(flag) || undefined}><span>{flag === "eyes_closed" ? "눈감음" : flag === "face_too_dark" ? "얼굴 어두움" : "흔들림"}</span><b>{quality.flags.includes(flag) ? "의심" : quality.status === "needs_review" ? "확인 필요" : "정상"}</b></div>)}
              {canManageQuality ? <footer><button type="button" onClick={() => onReviewQuality(focusedImage.id, "confirmed_issue")}>문제 확인</button><button type="button" onClick={() => onReviewQuality(focusedImage.id, "confirmed_normal")}>정상으로 확인</button></footer> : null}
              <small>AI 결과는 별점·셀렉·파일을 자동 변경하지 않습니다.</small>
            </section> : null}
            {!readOnly ? <div className={styles.previewControls}>
              <div><span>{activeCount > 1 ? `${activeCount}장에 셀렉 적용` : "고객 셀렉"}</span><RatingStars value={rating} onChange={onRate} /><ColorLabels value={colorLabel} onChange={onColor} /></div>
              <label>사진별 보정 메모<textarea value={note} maxLength={1000} onChange={(event) => onNote(event.target.value)} placeholder="이 사진에 필요한 보정 내용을 적어주세요." /></label>
            </div> : <div className={styles.readOnlyMarks}>{rating ? <span><Star size={13} fill="currentColor" />{rating}점</span> : null}{colorLabel ? <span><i style={{ background: BRIDGE_COLOR_LABELS[colorLabel].color }} />{BRIDGE_COLOR_LABELS[colorLabel].name}</span> : null}{note ? <p className={styles.readOnlyMemo}>{note}</p> : null}</div>}
          </> : <div className={styles.previewEmpty}><Images size={34} /><strong>미리 볼 사진을 선택해 주세요</strong></div>}
        </div>
      ) : (
        <section className={styles.chatPanel} aria-label="프로젝트 대화">
          <div className={styles.messageList}>
            {messages.map((message) => <article key={message.id} data-own={message.own || undefined}><header><strong>{message.authorName}</strong>{message.authorRole ? <span>{message.authorRole}</span> : null}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></header>{message.imageId ? <button type="button" className={styles.messageImageLink} onClick={() => { onFocusImage(message.imageId!); onSideTabChange("preview"); }}>{message.imageName || "연결 사진 보기"}</button> : null}<p>{message.body}</p></article>)}
            {!messages.length ? <div className={styles.chatEmpty}>프로젝트 사진에 관해 함께 이야기해 보세요.</div> : null}
            <div ref={messagesEndRef} />
          </div>
          {messagesEnabled ? <form className={styles.messageComposer} onSubmit={(event: FormEvent) => { event.preventDefault(); onSendMessage(); }}>
            <label className={styles.messageScope}><input type="checkbox" checked={messageImageScoped} disabled={!focusedImage} onChange={(event) => setMessageImageScoped(event.target.checked)} />{focusedImage ? `현재 사진 · ${focusedImage.original_file_name}` : "현재 사진 없음"}</label>
            <textarea value={messageText} maxLength={2000} placeholder="메시지를 입력하세요" onChange={(event) => setMessageText(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSendMessage(); } }} />
            <button type="submit" disabled={!messageText.trim() || sendingMessage} aria-label="메시지 보내기"><Send size={16} /></button>
          </form> : null}
          {messageState ? <p className={styles.messageState}>{messageState}</p> : null}
        </section>
      )}
    </aside>
  );
});
