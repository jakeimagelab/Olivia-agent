"use client";

import { Info } from "lucide-react";

import styles from "@/components/person-select/PersonSelectAdmin.module.css";
import type { PersonSelectAdminData, PersonSelectSharedReviewer } from "@/lib/person-select/adminData";
import { formatRelativeTime } from "@/lib/person-select/format";

export function PersonSelectSharedProgressPanel({
  data,
  reviewers,
  selectedReviewer,
  onReviewerChange,
  onDeliveryAction,
}: {
  data: PersonSelectAdminData;
  reviewers: PersonSelectSharedReviewer[];
  selectedReviewer: PersonSelectSharedReviewer | null;
  onReviewerChange: (reviewerId: string) => void;
  onDeliveryAction: (action: "reopen" | "extend") => void | Promise<void>;
}) {
  const selection = selectedReviewer?.selection ?? null;
  const displayedItems = selection?.items ?? selectedReviewer?.draft?.items ?? [];
  const displayedMemo = selection?.customer_memo ?? selectedReviewer?.draft?.customerMemo ?? "";
  const deliveries = data.shared?.deliveries ?? [];

  return <section className={styles.matchingPanel}>
    <div className={styles.matchingHeader}><div><h2>검토자별 고객 셀렉</h2><p>{selection ? `${selectedReviewer?.display_name ?? "검토자"}가 ${displayedItems.length.toLocaleString()}장을 최종 제출했습니다.` : displayedItems.length ? `${selectedReviewer?.display_name ?? "검토자"}의 서버 저장 셀렉 ${displayedItems.length.toLocaleString()}장을 표시합니다. 최종 제출 전입니다.` : "검토자를 선택해 서버에 저장된 셀렉과 최종 제출 결과를 확인하세요."}</p><small className={styles.summary}>서버 기준 · 마지막 저장 {formatRelativeTime(selectedReviewer?.server_last_saved_at ?? null)}{selectedReviewer?.display_name ? ` (${selectedReviewer.display_name})` : ""}</small></div><div className={styles.actions}>{reviewers.length ? <select className={styles.select} aria-label="셀렉을 확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => onReviewerChange(event.target.value)}>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""} · {reviewer.selection ? `제출 ${reviewer.selection.items.length}장` : `저장 ${reviewer.server_selected_count ?? reviewer.draft?.selected_count ?? 0}장`}</option>)}</select> : null}{selection ? <span className={styles.status}>제출 완료</span> : displayedItems.length ? <span className={`${styles.status} ${styles.statusIdle}`}>서버 저장됨 · 제출 전</span> : <span className={`${styles.status} ${styles.statusIdle}`}>저장된 셀렉 없음</span>}</div></div>
    {deliveries.length > 0 ? <div className={styles.deliverySummary}>
      <div><strong>보정본 {deliveries.length}장</strong><span> · 수정 요청 {deliveries.filter((item) => item.status === "revision_requested").length}장 · {data.event.delivery_state === "approved" ? `최종 확인 ${data.event.delivery_approved_at ? new Date(data.event.delivery_approved_at).toLocaleDateString("ko-KR") : "완료"}` : "확인 중"} · {data.event.delivery_downloaded_at ? "다운로드 완료" : "미다운로드"}</span></div>
      <div className={styles.actions}><button className={styles.weak} onClick={() => void onDeliveryAction("reopen")}>다시 열기</button><button className={styles.weak} disabled={!data.event.delivery_approved_at} onClick={() => void onDeliveryAction("extend")}>보관 연장 +30일</button></div>
    </div> : null}
    {displayedMemo ? <div className={styles.notice}>전체 메모<br />{displayedMemo}</div> : null}
    {displayedItems.length ? <div className={styles.matchingGrid}>{displayedItems.map((item) => <article className={styles.matchingCard} key={item.image_id}>{item.image?.thumb_url ? <img className={styles.matchingPhoto} src={item.image.thumb_url} alt={item.image.original_file_name} loading="lazy" /> : <div className={styles.matchingPhotoEmpty}>사진 확인 필요</div>}<div className={styles.matchingMeta}><div><strong>{item.image?.original_file_name ?? item.image_id}</strong><span>{item.customer_rating ? `${item.customer_rating}점` : item.customer_color_label ? `${item.customer_color_label}번 컬러` : "선택"}</span></div><p>{item.image?.source_rel_path ?? "상대경로 없음"}</p>{item.memo ? <small>{item.memo}</small> : null}</div></article>)}</div> : <div className={styles.matchingEmpty}><Info size={28} /><strong>서버에 저장된 셀렉이 없어요.</strong><span>고객이 셀렉하면 최종 제출 전에도 같은 사진이 여기에 표시됩니다.</span></div>}
  </section>;
}
