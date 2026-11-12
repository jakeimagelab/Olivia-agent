"use client";

import type { ReactNode } from "react";
import { FolderOpen, Info, Link2, UsersRound } from "lucide-react";

import styles from "@/components/person-select/PersonSelectAdmin.module.css";
import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import type { PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import { formatRelativeTime, formatWon } from "@/lib/person-select/format";

export type PersonSelectProgressFilter = "all" | "done" | "saving" | "unseen" | "delivery_revision";

export function PersonSelectIndividualProgressPanel({
  data,
  filter,
  onFilterChange,
  selectedPersonId,
  onPersonSelect,
  onPersonOpen,
  rawBusy,
  rawDisabled,
  rawDisabledReason,
  onRawMatchOpen,
  rawStatus,
  importResult,
  sourceFolder,
  isSchool,
  assignments,
  onAssignmentsChange,
  onSaveGroups,
  onDeliveryAction,
}: {
  data: PersonSelectAdminData;
  filter: PersonSelectProgressFilter;
  onFilterChange: (filter: PersonSelectProgressFilter) => void;
  selectedPersonId: string | null;
  onPersonSelect: (personId: string) => void;
  onPersonOpen: (person: PersonSelectAdminPerson) => void;
  rawBusy: boolean;
  rawDisabled: boolean;
  rawDisabledReason: string;
  onRawMatchOpen: () => void;
  rawStatus: ReactNode;
  importResult: Record<string, unknown> | null;
  sourceFolder: string;
  isSchool: boolean;
  assignments: Record<string, string>;
  onAssignmentsChange: (assignments: Record<string, string>) => void;
  onSaveGroups: () => void | Promise<void>;
  onDeliveryAction: (action: "reopen" | "extend", personId?: string) => void | Promise<void>;
}) {
  const categories = data.event.categories ?? [];
  const personWord = isSchool ? "선생님" : "이름";
  const counts = {
    done: data.people.filter((person) => person.status_label.includes("제출")).length,
    saving: data.people.filter((person) => person.status_label === "선택 중").length,
    unseen: data.people.filter((person) => person.status_label === "미접속").length,
    deliveryRevision: data.people.filter((person) => Number(person.delivery_revision_count ?? 0) > 0).length,
  };
  const filters: [PersonSelectProgressFilter, string, number][] = [
    ["all", "전체", data.people.length],
    ["done", "제출 완료", counts.done],
    ["saving", "선택 중", counts.saving],
    ["unseen", "미접속", counts.unseen],
    ["delivery_revision", "수정 요청", counts.deliveryRevision],
  ];
  const filtered = data.people.filter((person) => {
    if (filter === "done") return person.status_label.includes("제출");
    if (filter === "saving") return person.status_label === "선택 중";
    if (filter === "unseen") return person.status_label === "미접속";
    if (filter === "delivery_revision") return Number(person.delivery_revision_count ?? 0) > 0;
    return true;
  });
  const groupFolders = Array.isArray(importResult?.groupFolders) ? (importResult.groupFolders as unknown[]).map(String) : [];
  const unnamedFolders = Array.isArray(importResult?.unnamedFolders) ? (importResult.unnamedFolders as unknown[]).map(String) : [];
  const lastSavedAt = data.people.map((person) => person.server_last_saved_at ?? null).filter(Boolean).sort().at(-1) ?? null;

  return <>
    <div className={styles.underTabs}>{filters.map(([key, label, count]) => <button key={key} className={filter === key ? styles.underTabActive : ""} onClick={() => onFilterChange(key)}>{label}<small>{count}</small></button>)}</div>
    <div className={styles.rawMatchToolbar}><div><strong>고객 셀렉 RAW 매칭</strong><span>{rawDisabledReason || "최종 제출본 또는 현재 고른 상태를 기준으로 실행할 수 있어요."}</span><small className={styles.summary}>서버 기준 · 마지막 저장 {formatRelativeTime(lastSavedAt)}</small></div><button className={styles.primary} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={onRawMatchOpen}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button></div>
    {rawStatus}
    <section className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>{personWord}</th>{data.groups.length ? <th>담임 반</th> : null}{categories.map((category) => <th key={category.key}>{categories.length === 1 ? "고른 사진" : category.label} ({category.pick}장)</th>)}<th>보정 요청</th><th>추가 주문</th><th>보정본 전달</th><th>상태</th><th>최근 활동</th><th /></tr></thead>
      <tbody>{filtered.map((person) => {
        const requests = person.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0);
        return <tr key={person.id} className={person.id === selectedPersonId ? styles.rowSelected : ""} onClick={() => onPersonSelect(person.id)}>
          <td><strong>{person.display_name}</strong></td>
          {data.groups.length ? <td>{person.group_label || "—"}</td> : null}
          {categories.map((category) => {
            const own = person.choices.filter((choice) => choice.category_key === category.key);
            const need = person.need_counts?.[category.key] ?? 0;
            const registered = person.representative_images?.[category.key];
            if (need === 0) return <td key={category.key} className={styles.muted}>해당 없음</td>;
            return <td key={category.key}><span className={styles.thumbs}>{Array.from({ length: Math.min(Math.max(need, own.length), 4) }, (_, index) => { const chosenThumb = own[index]?.person_select_images?.thumb_url; const registeredThumb = index === 0 && !chosenThumb ? registered?.thumb_url : ""; return chosenThumb ? <img key={index} className={styles.thumb} src={chosenThumb} alt="고른 사진" /> : registeredThumb ? <img key={index} className={`${styles.thumb} ${styles.thumbRegistered}`} src={registeredThumb} alt={`${person.display_name} 등록 확인 사진`} title={`${registered?.original_file_name} · 고객 선택 전 등록 확인 사진`} /> : <span key={index} className={styles.thumbEmpty} />; })}<span className={styles.thumbCount}>{own.length > need ? `${own.length}장 (기본 ${need} + 추가 ${own.length - need})` : `${own.length} / ${need}장`}</span></span></td>;
          })}
          <td className={styles.muted}>{requests ? `${requests}개${person.choices.some((choice) => choice.memo) ? " · 메모 있음" : ""}` : person.choices.length ? "기본 보정" : "—"}</td>
          <td className={person.order?.total ? styles.orderTotal : styles.muted} title={person.order?.lines.map((line) => `${line.label} ${line.detail} ×${line.qty}`).join("\n") ?? ""}>{person.order?.total ? formatWon(person.order.total) : "—"}</td>
          <td><div className={styles.deliveryCell}><strong>{person.delivery_count ? `${person.delivery_count}장` : "—"}</strong>{person.delivery_revision_count ? <span className={styles.deliveryRevision}>수정 요청 {person.delivery_revision_count}장</span> : person.delivery_state === "approved" ? <span>최종 확인</span> : person.delivery_count ? <span>확인 중</span> : null}{person.delivery_downloaded_at ? <small>다운로드 완료</small> : null}<div className={styles.deliveryRowActions}>{person.delivery_count ? <button type="button" onClick={(event) => { event.stopPropagation(); void onDeliveryAction("reopen", person.id); }}>다시 열기</button> : null}{person.delivery_approved_at ? <button type="button" onClick={(event) => { event.stopPropagation(); void onDeliveryAction("extend", person.id); }}>+30일</button> : null}</div></div></td>
          <td><span className={`${styles.status} ${person.status_label === "미접속" ? styles.statusIdle : person.status_label === "선택 중" ? styles.statusPending : ""}`}>{person.status_label}</span></td>
          <td className={styles.muted} title={person.latest_activity_at ? new Date(person.latest_activity_at).toLocaleString("ko-KR") : ""}>{formatRelativeTime(person.latest_activity_at)}</td>
          <td><button className={styles.detailButton} onClick={(event) => { event.stopPropagation(); onPersonSelect(person.id); onPersonOpen(person); }}>보기</button></td>
        </tr>;
      })}</tbody>
    </table></div>{filtered.length === 0 ? <div className={styles.loading}>해당하는 사람이 없어요.</div> : null}</section>
    {filter === "delivery_revision" ? <section className={styles.deliveryRevisionPanel}><h2>수정 요청 보정본</h2><div className={styles.deliveryRevisionGrid}>{filtered.flatMap((person) => (person.deliveries ?? []).filter((item) => item.status === "revision_requested").map((item) => <article key={item.id} className={styles.deliveryRevisionCard}>{item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <div className={styles.matchingPhotoEmpty}>미리보기 없음</div>}<div><strong>{person.display_name} · {item.display_name}</strong><p>{item.customer_memo || "수정 요청 메모 없음"}</p><small>{(item.versions ?? []).map((version) => `v${version.version}${version.customer_memo_snapshot ? ` · ${version.customer_memo_snapshot}` : ""}`).join(" / ") || `v${item.current_version}`}</small></div></article>))}</div></section> : null}
    <div className={styles.infoChips}>
      {groupFolders.length ? <span className={styles.infoChip}><UsersRound size={13} />그룹 사진 <b>{groupFolders.join(" · ")}</b> 은 작가가 직접 고름</span> : null}
      {unnamedFolders.length ? <span className={styles.infoChip}><Info size={13} />이름 미변경 <b>{unnamedFolders.join(" · ")}</b> 건너뜀</span> : null}
      {!isSchool && sourceFolder ? <span className={styles.infoChip}><FolderOpen size={13} />RAW 저장 위치 <b>{sourceFolder}/Selected_RAW/이름</b></span> : null}
    </div>
    {data.groups.length ? <section className={styles.uploadCard} style={{ marginTop: 18 }}><h2>담임 반 연결</h2><p className={styles.summary}>반 사진을 담당 선생님에게 연결합니다.</p><div className={styles.groupRows}>{data.groups.map((group) => <div className={styles.groupRow} key={group.label}><strong>{group.label}</strong><select className={styles.select} value={assignments[group.label] || ""} onChange={(event) => onAssignmentsChange({ ...assignments, [group.label]: event.target.value })}><option value="">미연결</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span>{group.image_count}장</span></div>)}</div><div className={styles.formActions}><button className={styles.secondary} onClick={() => void onSaveGroups()}>담임 반 연결 저장</button></div></section> : null}
  </>;
}
