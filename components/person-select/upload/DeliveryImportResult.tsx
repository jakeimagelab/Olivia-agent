import type { PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

export function getDeliveryImportUnassigned(result: Record<string, unknown>) {
  return Array.isArray(result.unassigned) ? result.unassigned.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    return typeof row.deliveryId === "string" ? [{
      deliveryId: row.deliveryId,
      fileName: String(row.fileName ?? "보정본"),
      parentFolderName: typeof row.parentFolderName === "string" ? row.parentFolderName : null,
    }] : [];
  }) : [];
}

export function DeliveryImportResult({ result, people, isShared, assignments, busy, onRetry, onAssignmentChange, onAssign }: {
  result: Record<string, unknown>;
  people: PersonSelectAdminPerson[];
  isShared: boolean;
  assignments: Record<string, string>;
  busy: boolean;
  onRetry: () => void;
  onAssignmentChange: (deliveryId: string, value: string) => void;
  onAssign: (deliveryId: string) => void;
}) {
  const unassigned = getDeliveryImportUnassigned(result);
  if (result.error) {
    const diagnostics = result.diagnostics && typeof result.diagnostics === "object" ? result.diagnostics as Record<string, unknown> : null;
    return <div className={styles.deliveryError} role="alert"><strong>실패 · {String(result.error)}</strong><span>단계: {String(result.stage ?? "확인 필요")} · {new Date().toLocaleString("ko-KR")}</span><div><details><summary>자세히</summary><pre>{JSON.stringify(diagnostics ?? result, null, 2)}</pre></details><button type="button" className={styles.secondary} disabled={busy} onClick={onRetry}>다시 시도</button></div></div>;
  }
  if (result.uploadedCount === undefined) return <div className={styles.result}>{String(result.message || "보정본을 처리하고 있어요.")}</div>;
  return <div className={styles.deliveryImportResult}>
    <div className={styles.result}>올림 {Number(result.uploadedCount).toLocaleString()}장 · 새 버전 {Number(result.newVersionCount ?? 0).toLocaleString()}장 · 자동연결(촬영시각 {Number(result.exifCount ?? 0).toLocaleString()} / 파일명 {Number(result.filenameCount ?? 0).toLocaleString()} / 폴더 {Number(result.folderCount ?? 0).toLocaleString()}) · 연결 안 됨 {Number(result.unassignedCount ?? 0).toLocaleString()}장</div>
    {unassigned.length ? <div className={styles.deliveryAssignments}><strong>연결 안 된 보정본</strong>{unassigned.map((item) => <div key={item.deliveryId} className={styles.deliveryAssignmentRow}><span>{item.fileName}{item.parentFolderName ? ` · ${item.parentFolderName}` : ""}</span>{isShared ? <input className={styles.input} value={assignments[item.deliveryId] ?? item.parentFolderName ?? ""} onChange={(event) => onAssignmentChange(item.deliveryId, event.target.value)} placeholder="그룹 이름" /> : <select className={styles.select} value={assignments[item.deliveryId] ?? ""} onChange={(event) => onAssignmentChange(item.deliveryId, event.target.value)}><option value="">고객 선택</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select>}<button className={styles.secondary} onClick={() => onAssign(item.deliveryId)}>연결</button></div>)}</div> : null}
  </div>;
}
