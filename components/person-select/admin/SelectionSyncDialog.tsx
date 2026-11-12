import { RefreshCw, X } from "lucide-react";
import type { PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import { formatRelativeTime } from "@/lib/person-select/format";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type SyncReviewer = {
  id: string;
  display_name: string;
  role_label: string | null;
  server_selected_count?: number;
  server_last_saved_at?: string | null;
  recent_save_failure_count?: number;
  draft: { selected_count: number } | null;
};

type SyncFailure = {
  actor_type: "person" | "reviewer";
  actor_id: string;
  at: string;
  error: string;
};

export function SelectionSyncDialog({
  eventTitle,
  reviewers,
  people,
  recentFailureCount,
  recentFailures,
  onClose,
  onRefresh,
}: {
  eventTitle: string;
  reviewers: SyncReviewer[];
  people: PersonSelectAdminPerson[];
  recentFailureCount: number;
  recentFailures: SyncFailure[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  return <div className={styles.modalBackdrop} onClick={onClose}>
    <section className={styles.pinDialog} role="dialog" aria-modal="true" aria-labelledby="selection-sync-title" onClick={(event) => event.stopPropagation()}>
      <div className={styles.modalTop}><div><p className={styles.eyebrow}>서버 저장 상태</p><h2 id="selection-sync-title">동기화 확인</h2><p>{eventTitle} · 최근 저장 실패 {recentFailureCount}건</p></div><button type="button" className={styles.weak} aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
      <div className={styles.pinTableWrap}><table className={styles.pinTable}><thead><tr><th>검토자·고객</th><th>서버 저장 장수</th><th>마지막 저장</th><th>최근 실패</th></tr></thead><tbody>
        {reviewers.map((reviewer) => <tr key={`reviewer-${reviewer.id}`}><td><strong>{reviewer.display_name}</strong><small>{reviewer.role_label || "공동 검토자"}</small></td><td>{reviewer.server_selected_count ?? reviewer.draft?.selected_count ?? 0}장</td><td>{formatRelativeTime(reviewer.server_last_saved_at ?? null)}</td><td>{reviewer.recent_save_failure_count ?? 0}건</td></tr>)}
        {people.map((person) => <tr key={`person-${person.id}`}><td><strong>{person.display_name}</strong><small>개인별 고객</small></td><td>{person.server_selected_count ?? person.choices.length}장</td><td>{formatRelativeTime(person.server_last_saved_at ?? null)}</td><td>{person.recent_save_failure_count ?? 0}건</td></tr>)}
      </tbody></table></div>
      {recentFailures.length ? <div className={styles.warning} role="alert">{recentFailures.slice(0, 5).map((failure) => <div key={`${failure.actor_type}-${failure.actor_id}-${failure.at}`}>{new Date(failure.at).toLocaleString("ko-KR")} · {failure.error}</div>)}</div> : null}
      <div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={onRefresh}><RefreshCw size={15} />새로 확인</button><button type="button" className={styles.primary} onClick={onClose}>닫기</button></div>
    </section>
  </div>;
}
