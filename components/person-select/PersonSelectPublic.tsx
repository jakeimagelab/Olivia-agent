"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ChevronRight, ImageIcon, LogOut, ShoppingBag } from "lucide-react";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import { clearPersonSelectImageCache } from "./usePersonSelectImages";
import { PersonSelectOfferNotice as OfferNotice } from "./PersonSelectOfferNotice";
import { PersonSelectPcWorkspace as PcWorkspace } from "./PersonSelectPcWorkspace";
import PersonSelectDeliveryReview from "./PersonSelectDeliveryReview";
import { FinalSelectionSubmitDialog } from "./FinalSelectionSubmitDialog";
import {
  formatPersonSelectWon as won,
  isPersonSelectCategoryComplete as isComplete,
  isSchoolPersonSelectEvent as isSchoolEvent,
  personSelectExtraCount as extraCount,
  personSelectFinalReviewData as finalReviewData,
  personSelectNeedMessage as needMessage,
  personSelectRetouchCount as retouchCount,
  PERSON_SELECT_FIRST_PHOTO_TIMER_KEY,
  shortPersonSelectFileName as shortFileName,
  type PersonSelectCategoryData as Category,
  type PersonSelectMeData as MeData,
  type PersonSelectOrderLine as OrderLine,
  type PersonSelectPublicEvent as PublicEvent,
} from "./personSelectPublicModel";
import {
  personSelectJsonFetch as jsonFetch,
  usePendingPersonChoiceSyncCount,
  usePersonSelectData as useSelectionData,
} from "./usePersonSelectPublicData";
import styles from "./PersonSelectPublic.module.css";

export { PersonSelectMobileCategory as PersonSelectCategory } from "./PersonSelectMobileCategory";
export { PersonSelectFeedback } from "./PersonSelectFeedback";
export { PersonSelectOrder } from "./PersonSelectOrder";

export function PersonSelectLogin({ slug, event }: { slug: string; event: PublicEvent | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const school = isSchoolEvent(event);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      clearPersonSelectImageCache(slug);
      window.sessionStorage.setItem(PERSON_SELECT_FIRST_PHOTO_TIMER_KEY, String(Date.now()));
      await jsonFetch(`/api/pick/${slug}/login`, { method: "POST", body: JSON.stringify({ name, pin }) });
      router.replace(`/pick/${slug}/home`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "이름 또는 비밀번호가 맞지 않아요."); }
    finally { setBusy(false); }
  }

  return <main className={styles.loginPage}>
    <section className={styles.loginShell}>
      <div className={styles.loginIntro}>
        <div>
          <div className={styles.mark}><ImageIcon size={22} /></div>
          <p className={styles.eyebrow}>{event?.title || "개인별 사진 셀렉"}</p>
          <h1>{school ? "선생님의 사진을 직접 골라주세요." : "내 사진을 직접 골라주세요."}</h1>
          <p>{school ? "졸업앨범에" : "앞으로"} 사용할 사진을 확인하고<br />원하는 보정 내용을 남길 수 있어요.</p>
        </div>
        <div className={styles.stepList}>
          <span><b>1</b> 이름과 비밀번호로 들어가기</span>
          <span><b>2</b> 정해진 장수만큼 사진 고르기</span>
          <span><b>3</b> 보정 요청을 남기고 제출하기</span>
        </div>
      </div>
      <form className={styles.loginForm} onSubmit={submit}>
        <p className={styles.eyebrow}>개인별 사진 셀렉</p>
        <h2>내 사진 보기</h2>
        <p className={styles.muted}>{school ? "학교에서" : "포토클리닉에서"} 받은 이름과 비밀번호 4자리를 입력해 주세요.</p>
        {event ? <p className={styles.loginDeadline}>마감 {formatSeoulDeadline(event.deadline_at)}</p> : null}
        {event?.status === "draft" ? <div className={styles.error}>아직 열리지 않았어요.</div> : null}
        <div className={styles.field}><label htmlFor="pick-name">이름</label><input id="pick-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={school ? "선생님 이름" : "이름"} /></div>
        <div className={styles.field}><label htmlFor="pick-pin">비밀번호</label><input id="pick-pin" className={`${styles.input} ${styles.pin}`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" /></div>
        {error ? <div className={styles.error}>{error}</div> : null}
        <button className={`${styles.primary} ${styles.loginButton}`} disabled={busy || event?.status === "draft" || !name.trim() || pin.length !== 4}>{busy ? "확인하는 중이에요" : "들어가기"}</button>
        <p className={styles.deadline}>{school ? "비밀번호를 잊었다면 학교 담당 선생님께 문의해 주세요." : "비밀번호를 잊었다면 포토클리닉에 문의해 주세요."}</p>
      </form>
    </section>
  </main>;
}
function Header({ me, slug, desktopControls }: { me: MeData; slug: string; desktopControls?: ReactNode }) {
  const router = useRouter();
  return <header className={styles.topbar}>
    <div className={styles.brand}><i><ImageIcon size={16} /></i><span>{me.event.title}</span></div>
    {desktopControls ? <div className={styles.pcHeaderControls}>{desktopControls}</div> : null}
    <div className={styles.headerMeta}>
      <span className={styles.deadlineChip}>마감 {formatSeoulDeadline(me.event.deadline_at)}</span>
      <button className={styles.weak} aria-label="로그아웃" onClick={async () => { clearPersonSelectImageCache(slug); await fetch(`/api/pick/${slug}/logout`, { method: "POST" }); router.replace(`/pick/${slug}`); }}><LogOut size={17} /></button>
    </div>
  </header>;
}

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
          {first?.thumb_url ? <img className={styles.choiceThumb} src={first.thumb_url} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /> : <span className={`${styles.choiceThumb} ${styles.emptyThumb}`}><ImageIcon size={21} /></span>}
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

export function PersonSelectDone({ slug }: { slug: string }) {
  const router = useRouter();
  const { me, loading } = useSelectionData(slug);
  if (loading || !me) return <main className={styles.page}><div className={styles.done}>사진을 불러오는 중이에요</div></main>;
  return <main className={styles.page}><Header me={me} slug={slug} /><section className={styles.done}><div className={styles.doneIcon}><CheckCircle2 /></div><h1>사진 셀렉을 제출했어요.</h1><p className={styles.muted}>마감 전까지 언제든 선택과 보정 요청을 바꿀 수 있어요.</p><div className={styles.summaryList}>{me.categories.flatMap((category) => category.choices.map((choice) => <div className={styles.summaryRow} key={choice.id}><img src={choice.thumb_url || ""} alt="고른 사진" draggable={false} onContextMenu={(e) => e.preventDefault()} /><div><strong>{category.label}</strong><p>{choice.original_file_name}</p><small className={styles.muted}>보정 요청 {choice.retouch_keys.length}개 · 메모 {choice.memo ? "있음" : "없음"}</small></div></div>))}</div>{me.order?.lines.length ? <OrderSummary lines={me.order.lines} total={me.order.total} /> : null}<button className={styles.secondary} onClick={() => router.push(`/pick/${slug}/home`)}>선택 바꾸기</button></section></main>;
}

/** 추가 주문 내역과 합계 */
function OrderSummary({ lines, total }: { lines: OrderLine[]; total: number }) {
  return <div className={styles.orderSummary}>
    <h3>추가 주문</h3>
    {lines.map((line, index) => <div key={index} className={styles.orderSummaryRow}><div><strong>{line.label}</strong>{line.detail ? <small>{line.detail}</small> : null}</div><span>{line.qty} × {won(line.unitPrice)}</span><b>{won(line.amount)}</b></div>)}
    <div className={styles.orderSummaryTotal}><span>합계</span><b>{won(total)}</b></div>
    <p className={styles.muted}>결제 방법은 포토클리닉에서 따로 안내드려요.</p>
  </div>;
}
