"use client";

import { Check, Download, Expand, ImageIcon, LoaderCircle, MessageSquareText, PackageOpen, X } from "lucide-react";
import { personSelectDeliveryStatusLabel } from "@/components/person-select/personSelectDeliveryTypes";
import { usePersonSelectDeliveryReview } from "@/components/person-select/usePersonSelectDeliveryReview";
import styles from "./PersonSelectDeliveryReview.module.css";

export default function PersonSelectDeliveryReview({ apiBase, title, viewerName, canFinalize = true }: {
  apiBase: string;
  title: string;
  viewerName?: string;
  canFinalize?: boolean;
}) {
  const {
    data,
    focusedId,
    setFocusedId,
    focused,
    memo,
    setMemo,
    loading,
    busy,
    error,
    fullscreen,
    setFullscreen,
    downloadState,
    counts,
    load,
    updateItem,
    submit,
    downloadOne,
    downloadZip,
  } = usePersonSelectDeliveryReview({ apiBase, title });

  if (loading) return <main className={styles.statePage}><LoaderCircle className={styles.spin} /><span>보정본을 불러오는 중이에요.</span></main>;
  if (!data) return <main className={styles.statePage}><strong>{error || "보정본을 불러오지 못했습니다."}</strong><button type="button" onClick={() => void load()}>다시 시도</button></main>;
  if (!data.items.length) return <main className={styles.statePage}><PackageOpen /><h1>{data.event.title || title}</h1><strong>보정본을 준비 중입니다.</strong><span>준비가 끝나면 같은 링크에서 확인할 수 있어요.</span></main>;

  const locked = data.access.state === "approved";
  const effectiveCanFinalize = canFinalize && data.viewer.canFinalize;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p>PHOTO CLINIC · 보정본 확인</p><h1>{data.event.title || title}</h1><span>{viewerName || data.viewer.displayName}님 · 전체 {counts.total}장</span></div>
      <div className={styles.summary}><strong>{counts.approved}</strong><span>/ {counts.total}장 확인</span></div>
    </header>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {data.access.expired ? <div className={styles.notice}>보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요.</div> : null}
    {data.access.state === "revision_sent" ? <div className={styles.notice}>수정 요청을 보냈습니다. 새 보정본이 올라오면 이 화면에서 확인할 수 있어요.</div> : null}
    <section className={styles.workspace}>
      <div className={styles.gridPane}>
        <div className={styles.grid}>{data.items.map((item) => <button key={item.id} type="button" className={styles.card} data-active={item.id === focusedId} data-status={item.status} onClick={() => setFocusedId(item.id)}>
          <span className={styles.thumb}>{item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <ImageIcon />}</span>
          <span className={styles.cardText}><strong>{item.display_name}</strong><small>{item.group_label || `v${item.current_version}`} · {personSelectDeliveryStatusLabel(item.status)}</small></span>
          {item.status === "approved" ? <i className={styles.approved}><Check size={13} /></i> : null}
          {item.status === "revised" ? <i className={styles.revised}>수정됨</i> : null}
        </button>)}</div>
      </div>
      <aside className={styles.previewPane}>
        <div className={styles.previewTitle}><div><span>미리보기</span><strong>{focused?.display_name}</strong></div><button type="button" aria-label="크게 보기" disabled={!focused} onClick={() => setFullscreen(true)}><Expand size={18} /></button></div>
        <div className={styles.preview}>{focused?.preview_url ? <img src={focused.preview_url} alt={focused.display_name} /> : <ImageIcon />}</div>
        {focused ? <div className={styles.reviewPanel}>
          <div className={styles.versionLine}><span>버전 v{focused.current_version}</span><b data-status={focused.status}>{personSelectDeliveryStatusLabel(focused.status)}</b></div>
          <label><span><MessageSquareText size={15} /> 사진별 수정 요청</span><textarea disabled={locked || busy} value={memo} maxLength={2_000} placeholder="수정할 내용을 구체적으로 적어주세요." onChange={(event) => setMemo(event.target.value)} /></label>
          {!locked ? <div className={styles.photoActions}><button type="button" disabled={busy} className={styles.revisionButton} onClick={() => void updateItem("request_revision")}>수정 요청</button><button type="button" disabled={busy} className={styles.approveButton} onClick={() => void updateItem("approve")}><Check size={16} />확인</button></div> : null}
        </div> : null}
      </aside>
    </section>
    <footer className={styles.footer}>
      <div><strong>확인 {counts.approved}장 · 수정 요청 {counts.revision}장</strong><span>{downloadState || (locked ? `최종 확인 완료${data.access.expiresAt ? ` · ${new Date(data.access.expiresAt).toLocaleDateString("ko-KR")}까지 보관` : ""}` : "사진별로 확인하거나 수정 요청을 남겨주세요.")}</span></div>
      {locked && data.access.downloadAvailable ? <div className={styles.footerActions}><button type="button" disabled={busy || !focused} onClick={() => void downloadOne()}><Download size={16} />한 장씩 저장</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void downloadZip()}><PackageOpen size={16} />전체 받기</button></div> : counts.revision ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit("submit_revisions")}>수정 요청 보내기 ({counts.revision})</button> : <button type="button" className={styles.primary} disabled={busy || counts.approved !== counts.total || !effectiveCanFinalize} title={!effectiveCanFinalize ? "최종 확정 권한이 없습니다." : ""} onClick={() => void submit("finalize")}>{effectiveCanFinalize ? "최종 확인" : "최종 확정 권한 없음"}</button>}
    </footer>
    {fullscreen && focused ? <div className={styles.fullscreen} role="dialog" aria-modal="true" onClick={() => setFullscreen(false)}><button type="button" aria-label="닫기" onClick={() => setFullscreen(false)}><X /></button><img src={focused.preview_url} alt={focused.display_name} /><span>{focused.display_name} · v{focused.current_version}</span></div> : null}
  </main>;
}
