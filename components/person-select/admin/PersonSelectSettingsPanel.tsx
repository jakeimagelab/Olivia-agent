"use client";

import { Clipboard, Plus, RefreshCw, Trash2 } from "lucide-react";

import { OfferSettings } from "@/components/person-select/admin/OfferSettings";
import type { usePersonSelectReviewerActions } from "@/components/person-select/admin/hooks/usePersonSelectReviewerActions";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";
import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import { formatSeoulDateTimeInput, formatSeoulDeadline } from "@/lib/person-select/date";
import { formatRelativeTime } from "@/lib/person-select/format";
import {
  PERSON_SELECT_ACCESS_MODE_LABELS,
  PERSON_SELECT_CUSTOMER_VIEW_LABELS,
  PERSON_SELECT_PROJECT_TYPE_LABELS,
} from "@/lib/person-select/projectSettings";
import { canPersonSelectReviewerFinalize } from "@/lib/person-select/reviewerPermissions";
import type { PersonSelectAccessMode, PersonSelectCustomerViewMode, PersonSelectProjectType } from "@/lib/person-select/types";

export function PersonSelectSettingsPanel({
  data,
  onDataChange,
  reviewerActions,
  publicPath,
  loginGuide,
  notice,
  onSave,
  onDelete,
}: {
  data: PersonSelectAdminData;
  onDataChange: (data: PersonSelectAdminData) => void;
  reviewerActions: ReturnType<typeof usePersonSelectReviewerActions>;
  publicPath: string;
  loginGuide: string;
  notice: string;
  onSave: (patch: Record<string, unknown>) => void | Promise<void>;
  onDelete: () => void;
}) {
  const isShared = data.event.access_mode === "project_shared";
  const categories = data.event.categories ?? [];
  const sharedReviewers = data.shared?.reviewers ?? [];
  const finalizeReviewerCount = sharedReviewers.filter((reviewer) => reviewer.active && canPersonSelectReviewerFinalize(reviewer)).length;
  const {
    reviewerName,
    setReviewerName,
    reviewerRole,
    setReviewerRole,
    issuedReviewerTokens,
    regenerateSharedLink,
    createReviewer,
    regenerateReviewerLink,
    setReviewerActive,
    setReviewerPermission,
    copyReviewerLink,
  } = reviewerActions;
  const updateEvent = (patch: Partial<PersonSelectAdminData["event"]>) => {
    onDataChange({ ...data, event: { ...data.event, ...patch } });
  };

  return <section className={styles.panel} style={{ padding: 22 }}>
    <div className={styles.formGrid}>
      <div className={`${styles.field} ${styles.fieldFull}`}><label>프로젝트명</label><input className={styles.input} value={data.event.title} onChange={(event) => updateEvent({ title: event.target.value })} /></div>
      <div className={styles.field}><label>마감일 (KST)</label><input className={styles.input} type="datetime-local" value={formatSeoulDateTimeInput(data.event.deadline_at)} onChange={(event) => updateEvent({ deadline_at: event.target.value })} /></div>
      <div className={styles.field}><label>상태</label><select className={styles.select} value={data.event.status} onChange={(event) => updateEvent({ status: event.target.value })}><option value="draft">준비 중 (고객 접속 안 됨)</option><option value="open">열림 (고객 선택 가능)</option><option value="closed">마감</option></select></div>
      <div className={styles.field}><label>프로젝트 유형</label><select className={styles.select} value={data.event.project_type ?? "general"} onChange={(event) => updateEvent({ project_type: event.target.value as PersonSelectProjectType })}>{Object.entries(PERSON_SELECT_PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className={styles.field}><label>접근 방식</label><select className={styles.select} value={data.event.access_mode ?? "individual"} onChange={(event) => updateEvent({ access_mode: event.target.value as PersonSelectAccessMode })}>{Object.entries(PERSON_SELECT_ACCESS_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small className={styles.summary}>사진만 올린 상태는 그대로 유지하며 변경할 수 있습니다. 실제 접속·선택·메모·주문·제출이 있거나 개인별 소유자/PIN이 불완전하면 정확한 이유를 안내하고 변경을 막습니다.</small></div>
      <div className={styles.field}><label>고객 화면 방식</label><select className={styles.select} value={data.event.customer_view_mode ?? "classic"} onChange={(event) => updateEvent({ customer_view_mode: event.target.value as PersonSelectCustomerViewMode })}>{Object.entries(PERSON_SELECT_CUSTOMER_VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className={styles.field}><label>고객 화면 단계</label><select className={styles.select} value={data.event.customer_stage ?? "select"} onChange={(event) => updateEvent({ customer_stage: event.target.value as "select" | "delivery" })}><option value="select">원본 셀렉</option><option value="delivery">보정본 확인</option></select><small className={styles.summary}>보정본 확인으로 바꾸면 고객 화면에서 원본 사진과 셀렉 기록은 숨기고 보정본만 표시합니다. 원본 데이터는 삭제하지 않습니다.</small></div>
      <div className={styles.field}><label>보정본 보관 기간(일)</label><input className={styles.input} type="number" min={1} max={3650} value={data.event.delivery_retention_days ?? 30} onChange={(event) => updateEvent({ delivery_retention_days: Math.max(1, Number(event.target.value) || 30) })} /><small className={styles.summary}>고객의 최종 확인일부터 계산합니다. 만료 후 원본만 삭제하고 미리보기와 기록은 유지합니다.</small></div>
      {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}><label>원본 다운로드 NAS 공유 링크</label><input className={styles.input} type="url" inputMode="url" value={data.event.nas_download_url ?? ""} onChange={(event) => updateEvent({ nas_download_url: event.target.value })} placeholder="https://..." /><small className={styles.summary}>기존 공유 링크 설정은 서버에만 보관합니다. 고객에게 NAS 주소를 직접 노출하지 않고, 권한이 있는 검토자의 요청만 Mac Studio가 원본 ZIP으로 준비해 5분짜리 다운로드 링크를 발급합니다.</small></div> : null}
      {isShared ? <label className={`${styles.check} ${styles.fieldFull}`}><input type="checkbox" checked={data.event.customer_ai_results_visible === true} onChange={(event) => updateEvent({ customer_ai_results_visible: event.target.checked })} /> 고객에게 AI 품질 검사 결과 공개 (검토자별 권한도 필요)</label> : null}
      <div className={`${styles.field} ${styles.fieldFull}`}><label>사진선택 항목</label><div className={styles.groupRows}>{categories.map((category, index) => <div className={styles.groupRow} key={category.key}><input className={styles.input} aria-label="항목 이름" value={category.label} onChange={(event) => updateEvent({ categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><select className={styles.select} value={category.pick} onChange={(event) => updateEvent({ categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, pick: Number(event.target.value) } : item) })}>{Array.from({ length: 50 }, (_, itemIndex) => itemIndex + 1).map((count) => <option key={count} value={count}>{count}장</option>)}</select><button type="button" className={styles.weak} disabled={categories.length <= 1} aria-label={`${category.label} 삭제`} onClick={() => updateEvent({ categories: categories.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button></div>)}</div><button type="button" className={styles.secondary} style={{ marginTop: 10 }} onClick={() => updateEvent({ categories: [...categories, { key: `item_${Date.now()}`, label: "새 사진 항목", pick: 1 }] })}><Plus size={14} />항목 추가</button><small className={styles.summary}>{isShared ? "공유 프로젝트의 항목은 안내·분류에 사용하며 사람별 수량으로 해석하지 않습니다." : "올라온 사진이 수량보다 적은 사람은 있는 만큼만 고르면 됩니다."}</small></div>
      {!isShared ? <OfferSettings event={data.event} onChange={updateEvent} /> : null}
      <div className={`${styles.field} ${styles.fieldFull}`}><label>고객 화면 및 접속 안내</label><div className={styles.notice}>주소: {typeof location !== "undefined" ? location.origin : ""}{publicPath}<br />{loginGuide}.<br />화면: {PERSON_SELECT_CUSTOMER_VIEW_LABELS[data.event.customer_view_mode ?? "classic"]}<br />마감: {formatSeoulDeadline(data.event.deadline_at)}</div><div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>{isShared ? <button className={styles.weak} onClick={() => void regenerateSharedLink()}><RefreshCw size={15} />공용 링크 재발급</button> : null}</div></div>
      {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}>
        <label>검토자별 링크</label>
        <small className={styles.summary}>정연호, 클라이언트, 매니저처럼 사람마다 별도 링크를 발급합니다. 각 링크의 별점·컬러·메모·제출은 서로 섞이지 않고 대화만 함께 공유됩니다.</small>
        {finalizeReviewerCount === 0 ? <div className={styles.warning} role="alert">최종 제출할 수 있는 검토자가 없습니다. 검토자 한 명 이상에게 최종 확정 권한을 주세요.</div> : null}
        <div className={styles.reviewerCreate}><input className={styles.input} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="검토자 이름" /><input className={styles.input} value={reviewerRole} onChange={(event) => setReviewerRole(event.target.value)} placeholder="역할 (선택)" /><button type="button" className={styles.secondary} onClick={() => void createReviewer()}><Plus size={14} />검토자 추가</button></div>
        <div className={styles.reviewerList}>{sharedReviewers.map((reviewer) => {
          const issuedToken = issuedReviewerTokens[reviewer.id];
          const issuedLink = issuedToken && typeof location !== "undefined" ? `${location.origin}/pick/shared/${issuedToken}` : "";
          return <article className={styles.reviewerRow} key={reviewer.id} data-inactive={!reviewer.active || undefined}>
            <div><strong>{reviewer.display_name}</strong><span>{reviewer.role_label || (reviewer.is_legacy ? "기존 공용 링크 호환" : "검토자")}</span><small>{reviewer.selection ? `최종 제출 ${reviewer.selection.items.length}장` : `자동 저장 ${reviewer.draft?.selected_count ?? 0}장`} · 최근 접속 {formatRelativeTime(reviewer.last_seen_at)}</small></div>
            {issuedLink ? <input className={styles.input} readOnly value={issuedLink} aria-label={`${reviewer.display_name} 발급 링크`} /> : <span className={styles.reviewerSecurity}>링크는 보안상 발급 직후에만 표시됩니다.</span>}
            <div className={styles.actions}><label className={styles.check}><input type="checkbox" checked={reviewer.can_view_ai_results === true} onChange={(event) => void setReviewerPermission(reviewer, "canViewAiResults", event.target.checked)} />AI 결과</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_jpg === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadJpg", event.target.checked)} />JPG 다운로드</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_raw === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadRaw", event.target.checked)} />RAW 다운로드</label><label className={styles.check}><input type="checkbox" checked={canPersonSelectReviewerFinalize(reviewer)} onChange={(event) => void setReviewerPermission(reviewer, "canFinalize", event.target.checked)} />최종 확정</label></div>
            <div className={styles.actions}>{issuedLink ? <button type="button" className={styles.secondary} onClick={() => void copyReviewerLink(reviewer.id)}><Clipboard size={14} />링크 복사</button> : null}{!reviewer.is_legacy ? <><button type="button" className={styles.weak} onClick={() => void regenerateReviewerLink(reviewer)}><RefreshCw size={14} />링크 재발급</button><button type="button" className={styles.weak} onClick={() => void setReviewerActive(reviewer, !reviewer.active)}>{reviewer.active ? "접속 중지" : "접속 허용"}</button></> : null}</div>
          </article>;
        })}</div>
      </div> : null}
    </div>
    <div className={styles.formActions}><button type="button" className={styles.danger} onClick={onDelete}><Trash2 size={15} />프로젝트 삭제</button><button className={styles.secondary} onClick={() => onSave({ title: data.event.title, deadline_at: data.event.deadline_at, status: data.event.status, categories, project_type: data.event.project_type ?? "general", access_mode: data.event.access_mode ?? "individual", customer_view_mode: data.event.customer_view_mode ?? "classic", customer_stage: data.event.customer_stage ?? "select", delivery_retention_days: data.event.delivery_retention_days ?? 30, nas_download_url: data.event.nas_download_url ?? null, customer_ai_results_visible: data.event.customer_ai_results_visible === true, offer_notice: data.event.offer_notice ?? "", extra_price: data.event.extra_price ?? 0, extra_max: data.event.extra_max ?? 0, offers: data.event.offers ?? [] })}>설정 저장</button></div>
  </section>;
}
