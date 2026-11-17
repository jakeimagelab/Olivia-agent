"use client";

import { Check, Download, Expand, ImageIcon, LoaderCircle, MessageSquareText, PackageOpen, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { personSelectDeliveryStatusLabel } from "@/components/person-select/personSelectDeliveryTypes";
import { usePersonSelectDeliveryReview } from "@/components/person-select/usePersonSelectDeliveryReview";
import styles from "./PersonSelectDeliveryReview.module.css";

export default function PersonSelectDeliveryReview({
  apiBase,
  title,
  viewerName,
  canFinalize = true,
  topContent,
  mode = "review",
  originalsByImageId = {},
}: {
  apiBase: string;
  title: string;
  viewerName?: string;
  canFinalize?: boolean;
  topContent?: ReactNode;
  mode?: "review" | "download";
  originalsByImageId?: Record<string, string>;
}) {
  const review = usePersonSelectDeliveryReview({ apiBase, title });
  const [compareOriginal, setCompareOriginal] = useState(false);
  const { data, focusedId, setFocusedId, focused, memo, setMemo, loading, busy, error, fullscreen, setFullscreen, downloadState, counts, load, updateItem, submit, downloadOne, downloadZip } = review;

  if (loading) return <main className={styles.page}>{topContent}<div className={styles.statePage}><LoaderCircle className={styles.spin} /><span>보정본을 불러오는 중이에요.</span></div></main>;
  if (!data) return <main className={styles.page}>{topContent}<div className={styles.statePage}><strong>{error || "보정본을 불러오지 못했습니다."}</strong><button type="button" onClick={() => void load()}>다시 시도</button></div></main>;
  if (!data.items.length) return <main className={styles.page}>{topContent}<div className={styles.statePage}><PackageOpen /><strong>보정본을 준비 중입니다.</strong><span>준비가 끝나면 같은 링크에서 바로 확인할 수 있어요.</span></div></main>;

  const locked = data.access.state === "approved";
  const effectiveCanFinalize = canFinalize && data.viewer.canFinalize;
  const originalUrl = focused?.linked_image_id ? originalsByImageId[focused.linked_image_id] : "";
  if (mode === "download") return <main className={styles.page}>
    {topContent}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {data.access.expired ? <div className={styles.notice}>보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요.</div> : null}
    <section className={styles.downloadSection}>
      <div className={styles.downloadHeading}><div><p>최종 확인 완료</p><h2>고화질 보정본 {counts.total}장</h2><span>{data.access.expiresAt ? `${new Date(data.access.expiresAt).toLocaleDateString("ko-KR")}까지 받을 수 있어요.` : `${data.event.retentionDays}일 동안 받을 수 있어요.`}</span></div><button type="button" className={styles.primary} disabled={busy || !data.access.downloadAvailable} onClick={() => void downloadZip()}><PackageOpen size={17} />전체 다운로드</button></div>
      <div className={styles.downloadGrid}>{data.items.map((item) => <article key={item.id} className={styles.downloadCard}>
        <button type="button" className={styles.downloadPreview} onClick={() => { setFocusedId(item.id); setFullscreen(true); }}>{item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <ImageIcon />}</button>
        <div><strong>{item.display_name}</strong><span>v{item.current_version} · 최종 확인</span></div>
        <button type="button" className={styles.downloadOne} disabled={busy || !data.access.downloadAvailable} onClick={() => void downloadOne(item.id)}><Download size={15} />저장</button>
      </article>)}</div>
      {downloadState ? <p className={styles.downloadState}>{downloadState}</p> : null}
    </section>
    {fullscreen && focused ? <Fullscreen itemName={focused.display_name} url={focused.preview_url} onClose={() => setFullscreen(false)} /> : null}
  </main>;

  return <main className={styles.page}>
    {topContent}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {data.access.expired ? <div className={styles.notice}>보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요.</div> : null}
    {data.access.state === "revision_sent" ? <div className={styles.notice}>수정 요청을 보냈습니다. 새 보정본이 올라오면 이 화면에서 확인할 수 있어요.</div> : null}
    <section className={styles.reviewStage}>
      <div className={styles.reviewTopline}><div><strong>{viewerName || data.viewer.displayName}님 보정본</strong><span>{counts.approved} / {counts.total}장 확인</span></div><button type="button" disabled={!focused} onClick={() => setFullscreen(true)}><Expand size={17} />크게 보기</button></div>
      <div className={`${styles.hero} ${compareOriginal && originalUrl ? styles.heroCompare : ""}`}>
        {compareOriginal && originalUrl ? <figure><figcaption>선택 원본</figcaption><img src={originalUrl} alt="선택 원본" /></figure> : null}
        <figure><figcaption>보정본 · v{focused?.current_version ?? 1}</figcaption>{focused?.preview_url ? <img src={focused.preview_url} alt={focused.display_name} /> : <ImageIcon />}</figure>
      </div>
      <div className={styles.heroControls}><button type="button" disabled={!originalUrl} title={originalUrl ? "선택 원본과 나란히 봅니다." : "연결된 원본 미리보기가 없습니다."} aria-pressed={compareOriginal} onClick={() => setCompareOriginal((current) => !current)}>원본과 비교</button><strong>{focused?.display_name}</strong><span>{focused ? personSelectDeliveryStatusLabel(focused.status) : ""}</span></div>
      <div className={styles.filmstrip} aria-label="보정본 목록">{data.items.map((item) => <button key={item.id} type="button" className={item.id === focusedId ? styles.filmActive : ""} data-status={item.status} onClick={() => { setFocusedId(item.id); setCompareOriginal(false); }}>
        {item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <ImageIcon />}
        <i>{item.status === "approved" ? <Check size={13} /> : item.status === "revision_requested" ? "!" : ""}</i>
      </button>)}</div>
      {focused ? <section className={styles.reviewCard}>
        <div className={styles.versionLine}><span>v{focused.current_version}{focused.status === "revised" ? " · 수정됨" : ""}</span><b data-status={focused.status}>{personSelectDeliveryStatusLabel(focused.status)}</b></div>
        <label><span><MessageSquareText size={15} />수정할 내용</span><textarea disabled={locked || busy} value={memo} maxLength={2_000} placeholder="수정 요청을 누르려면 내용을 적어 주세요." onChange={(event) => setMemo(event.target.value)} /></label>
        {!locked ? <div className={styles.photoActions}><button type="button" disabled={busy} className={styles.revisionButton} onClick={() => void updateItem("request_revision")}>수정 요청</button><button type="button" disabled={busy} className={styles.approveButton} onClick={() => void updateItem("approve")}><Check size={16} />좋아요</button></div> : <p className={styles.lockedNote}>최종 확인이 끝나 보정본이 잠겼습니다.</p>}
      </section> : null}
    </section>
    <footer className={styles.footer}>
      <div><strong>좋아요 {counts.approved}장 · 수정 요청 {counts.revision}장</strong><span>모든 사진을 확인하면 최종 확인 버튼이 열려요.</span></div>
      {counts.revision ? <button type="button" className={styles.primary} disabled={busy || locked} onClick={() => void submit("submit_revisions")}>수정 요청 보내기 ({counts.revision})</button> : <button type="button" className={styles.primary} disabled={busy || locked || counts.approved !== counts.total || !effectiveCanFinalize} title={!effectiveCanFinalize ? "최종 확정 권한이 없습니다." : ""} onClick={() => void submit("finalize")}>{locked ? "최종 확인 완료" : effectiveCanFinalize ? "최종 확인" : "최종 확정 권한 없음"}</button>}
    </footer>
    {fullscreen && focused ? <Fullscreen itemName={focused.display_name} url={focused.preview_url} onClose={() => setFullscreen(false)} /> : null}
  </main>;
}

function Fullscreen({ itemName, url, onClose }: { itemName: string; url: string; onClose: () => void }) {
  return <div className={styles.fullscreen} role="dialog" aria-modal="true" onClick={onClose}><button type="button" aria-label="닫기" onClick={onClose}><X /></button><img src={url} alt={itemName} /><span>{itemName}</span></div>;
}
