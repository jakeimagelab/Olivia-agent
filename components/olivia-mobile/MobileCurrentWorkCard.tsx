import { AlertCircle, ArrowRight, CheckCircle2, CircleDashed, Eye, MessageCircle } from "lucide-react";
import { formatMobileWon, type MobileResource } from "@/lib/olivia/mobile/resources";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import styles from "./OliviaMobileShell.module.css";

export type MobileWorkState = "idle" | "working" | "done" | "failed";

function relativeTime(value?: string) {
  if (!value) return "최근 작업";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "최근 작업";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "방금 수정";
  if (minutes < 60) return `마지막 수정 ${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `마지막 수정 ${hours}시간 전`;
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function MobileCurrentWorkCard({
  resource,
  state,
  onPreview,
  onContinue,
}: {
  resource: MobileResource | null;
  state: MobileWorkState;
  onPreview: (resource: { resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string }) => void;
  onContinue: () => void;
}) {
  if (!resource) {
    return <div className={styles.emptyState}><CircleDashed size={22} /><span>현재 작성 중인 문서가 없어요.</span></div>;
  }
  const Icon = state === "failed" ? AlertCircle : state === "working" ? CircleDashed : CheckCircle2;
  const stateText = state === "failed" ? "수정하지 못했어요" : state === "working" ? "수정 중..." : state === "done" ? "수정 완료" : resource.statusLabel;
  return (
    <article className={`${styles.card} ${styles.currentWorkCard}`}>
      <div className={styles.currentWorkTop}>
        <span className={`${styles.workState} ${styles[`workState_${state}`]}`}><Icon size={13} />{stateText}</span>
        <ArrowRight size={17} className={styles.muted} />
      </div>
      <h3>{resource.title}</h3>
      {resource.totalAmount ? <strong className={styles.currentWorkAmount}>{formatMobileWon(resource.totalAmount)}</strong> : null}
      <p>{relativeTime(resource.updatedAt)}</p>
      <div className={styles.currentWorkActions}>
        <button type="button" onClick={() => onPreview({ resourceType: resource.type, resourceId: resource.id, temporaryDocumentId: resource.temporaryDocumentId })}><Eye size={16} />미리보기</button>
        <button type="button" onClick={onContinue}><MessageCircle size={16} />{state === "failed" ? "Olivia에게 확인" : "계속 작업"}</button>
      </div>
    </article>
  );
}

