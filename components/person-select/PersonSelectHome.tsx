"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ImageIcon, ShoppingBag } from "lucide-react";
import PersonSelectDeliveryReview from "./PersonSelectDeliveryReview";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import { PersonSelectHeader as Header } from "./PersonSelectHeader";
import { PersonSelectOfferNotice as OfferNotice } from "./PersonSelectOfferNotice";
import { PersonSelectPcWorkspace as PcWorkspace } from "./PersonSelectPcWorkspace";
import {
  formatPersonSelectWon as won,
  isPersonSelectCategoryComplete as isComplete,
  isSchoolPersonSelectEvent as isSchoolEvent,
  personSelectExtraCount as extraCount,
  personSelectFinalReviewData as finalReviewData,
  personSelectNeedMessage as needMessage,
  personSelectRetouchCount as retouchCount,
  shortPersonSelectFileName as shortFileName,
} from "./personSelectPublicModel";
import {
  personSelectJsonFetch as jsonFetch,
  usePendingPersonChoiceSyncCount,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectHome({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading, error } = useSelectionData(slug);
  const pendingSyncCount = usePendingPersonChoiceSyncCount(slug);
  const [submitError, setSubmitError] = useState("");
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pcActiveKey, setPcActiveKey] = useState("profile");
  if (loading) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  if (!me) return <main className={styles.page}><div className={styles.done}>{error || "다시 로그인해 주세요."}</div></main>;
  if (me.event.customer_stage === "delivery") return <PersonSelectDeliveryReview apiBase={`/api/pick/${slug}`} title={me.event.title} viewerName={me.person.display_name} />;
  const visibleCategories = me.categories
    .filter((category) => category.image_count > 0)
    .filter((category) => category.key !== "homeroom" || Boolean(me.person.group_label));
  const required = visibleCategories.filter((category) => category.need > 0);
  const completed = required.filter(isComplete).length;
  const missing = required.find((category) => !isComplete(category));
  const resolvedPcActiveKey = visibleCategories.some((category) => category.key === pcActiveKey) ? pcActiveKey : visibleCategories[0]?.key ?? "profile";
  const review = finalReviewData(visibleCategories);

  function openSubmitReview() {
    setSubmitError("");
    if (pendingSyncCount) { setSubmitError(`저장 안 된 변경 ${pendingSyncCount}건을 먼저 저장해 주세요.`); return; }
    setSubmitReviewOpen(true);
  }

  async function confirmSubmit() {
    if (submitting) return;
    setSubmitting(true); setSubmitError("");
    try { await jsonFetch(`/api/pick/${slug}/submit`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); router.push(`/pick/${slug}/done`); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "제출하지 못했어요."); }
    finally { setSubmitting(false); }
  }

  return <main className={`${styles.page} ${styles.pcHomePage}`}>
    <Header me={me} slug={slug} desktopControls={<>
      <div className={styles.pillbar}>{visibleCategories.map((category) => <button key={category.key} className={`${styles.pill} ${resolvedPcActiveKey === category.key ? styles.pillActive : ""}`} onClick={() => setPcActiveKey(category.key)}>{isComplete(category) ? <Check size={14} aria-hidden="true" /> : null}{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}{category.need > 1 ? ` ${category.choices.length}/${category.need}` : ""}</button>)}</div>
      <strong className={styles.pcHeaderProgress}>{completed} / {required.length} 선택</strong>
    </>} />
    <section className={`${styles.content} ${styles.mobileOnly}`}>
      <div className={styles.hello}><div><p className={styles.eyebrow}>사진 셀렉</p><h1>{me.person.display_name} {isSchoolEvent(me.event) ? "선생님" : "님"}</h1><p className={styles.muted}>각 항목에서 정해진 장수만큼 사진을 골라주세요.</p></div><div className={styles.progressText}>{completed} / {required.length} 선택</div></div>
      {me.event.locked ? <div className={styles.notice}>선택이 마감됐어요. 변경이 필요하면 포토클리닉에 연락해 주세요.</div> : null}
      <OfferNotice me={me} />
      <div className={styles.categoryList}>{visibleCategories.map((category) => {
        const first = category.choices[0];
        return <button key={category.key} className={styles.categoryRow} onClick={() => router.push(`/pick/${slug}/c/${category.key}`)}>
          {first?.thumb_url ? <img className={styles.choiceThumb} src={first.thumb_url} alt="고른 사진" draggable={false} onContextMenu={(event) => event.preventDefault()} /> : <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ImageIcon size={21} /></span>}
          <div><h3>{category.label}{category.key === "homeroom" && me.person.group_label ? ` · ${me.person.group_label}` : ""}</h3><p>{category.choices.length === 0 ? `${category.image_count}장 중 ${category.need}장 선택` : category.need === 1 && category.choices.length === 1 ? shortFileName(first.original_file_name) : extraCount(category) ? `${category.choices.length}장 골랐어요 (기본 ${category.need} + 추가 ${extraCount(category)})` : `${category.choices.length} / ${category.need}장 골랐어요`}</p></div>
          <span className={`${styles.badge} ${isComplete(category) ? "" : styles.badgePending}`}>{category.choices.length ? `보정 요청 ${retouchCount(category)}개` : "미선택"}</span>
          <ChevronRight size={18} />
        </button>;
      })}
        {(me.event.offers ?? []).length || me.event.extra_price ? <button className={styles.categoryRow} onClick={() => router.push(`/pick/${slug}/order`)}>
          <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ShoppingBag size={21} /></span>
          <div><h3>추가 주문</h3><p>{me.order?.lines.length ? me.order.lines.map((line) => line.label).join(" · ") : "추가 보정 · 액자 · 앨범 신청"}</p></div>
          <span className={`${styles.badge} ${me.order?.total ? styles.badgePending : ""}`}>{me.order?.total ? won(me.order.total) : "선택 사항"}</span>
          <ChevronRight size={18} />
        </button> : null}
      </div>
      <div className={styles.stepsCard}><h3>사진 셀렉은 이렇게 진행돼요</h3><div className={styles.stepList}><span><b>1</b>사진 확인</span><span><b>2</b>보정 요청</span><span><b>3</b>최종 제출</span></div></div>
    </section>
    <PcWorkspace slug={slug} me={me} activeKey={resolvedPcActiveKey} pendingSyncCount={pendingSyncCount} />
    <footer className={`${styles.submitDock} ${styles.mobileOnly}`}><div className={styles.submitDockInner}>{missing || submitError || pendingSyncCount ? <span className={styles.submitReason}>{submitError || (pendingSyncCount ? `저장 안 된 변경 ${pendingSyncCount}건 · 다시 시도` : missing ? needMessage(missing) : "")}</span> : null}<button className={styles.primary} disabled={Boolean(missing) || me.event.locked || pendingSyncCount > 0} onClick={openSubmitReview}>제출하기 ({completed}/{required.length})</button></div></footer>
    {submitReviewOpen ? <FinalSelectionSubmitDialog selectedCount={review.selectedCount} sections={review.sections} items={review.items} busy={submitting} error={submitError} onCancel={() => { if (!submitting) setSubmitReviewOpen(false); }} onConfirm={() => void confirmSubmit()} /> : null}
  </main>;
}
