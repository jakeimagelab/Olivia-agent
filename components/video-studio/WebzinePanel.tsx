"use client";

import { Copy } from "lucide-react";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import { BLOG_CATEGORY_LABEL, type VideoInterviewResult, type WebzineDraft } from "@/lib/video-interview/types";
import { copyText } from "./useVideoStudio";
import styles from "./VideoStudio.module.css";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const paragraphs = (value: string) => value.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, "<br>")}</p>`).join("\n");

/** 월간 포토클리닉 블로그 에디터의 웹진 블록 클래스(wz-*)로 만든 HTML */
export function webzineHtml(draft: WebzineDraft): string {
  return [
    `<h2>${escapeHtml(draft.headline)}</h2>`,
    draft.subhead ? `<div class="wz-hero-text"><p>${escapeHtml(draft.subhead)}</p></div>` : "",
    draft.lead ? `<div class="wz-highlight">${paragraphs(draft.lead)}</div>` : "",
    ...draft.sections.flatMap((section, index) => [
      `<h3>${escapeHtml(section.heading)}</h3>`,
      paragraphs(section.body),
      draft.pullQuotes[index] ? `<div class="wz-quote"><p>“${escapeHtml(draft.pullQuotes[index])}”</p></div>` : "",
    ]),
  ].filter(Boolean).join("\n");
}

export function webzineText(draft: WebzineDraft): string {
  return [draft.headline, draft.subhead, "", draft.lead, "", ...draft.sections.flatMap((section) => [`■ ${section.heading}`, section.body, ""]), ...draft.pullQuotes.map((quote) => `“${quote}”`)].join("\n");
}

export default function WebzinePanel({ result, notify }: { result: VideoInterviewResult; notify: (message: string) => void }) {
  const draft = result.analysis.webzine;
  if (!draft.headline && !draft.sections.length) return <div className={styles.panel}><div className={styles.empty}>웹진 초안이 없습니다.</div></div>;
  return (
    <div className={styles.panel}>
      <div className={styles.resultHead}>
        <div className={styles.resultTitle}>
          <h3>웹진 초안</h3>
          <p>블로그 카테고리: {BLOG_CATEGORY_LABEL[result.analysis.blogCategory]} · 인터뷰 원문에 근거해 작성된 초안입니다. 발행 전 사실 확인을 해주세요.</p>
        </div>
        <div className={styles.exportRow}>
          <button type="button" className={photoStyles.primaryButton} onClick={async () => notify((await copyText(webzineHtml(draft))) ? "블로그용 HTML 복사됨" : "복사하지 못했습니다")}><Copy size={14} /> 블로그용 HTML 복사</button>
          <button type="button" className={photoStyles.secondaryButton} onClick={async () => notify((await copyText(webzineText(draft))) ? "텍스트 복사됨" : "복사하지 못했습니다")}>텍스트 복사</button>
        </div>
      </div>
      <article className={`${styles.card} ${styles.webzine}`}>
        <h2>{draft.headline}</h2>
        {draft.subhead ? <p className={styles.subhead}>{draft.subhead}</p> : null}
        {draft.lead ? <p className={styles.lead}>{draft.lead}</p> : null}
        {draft.sections.map((section, index) => (
          <section key={`${section.heading}-${index}`}>
            <h4>{section.heading}{section.qaId !== null && result.analysis.qa[section.qaId] ? <span className={styles.badge} style={{ marginLeft: 8 }}>{result.analysis.qa[section.qaId].label}</span> : null}</h4>
            <p>{section.body}</p>
            {draft.pullQuotes[index] ? <blockquote>“{draft.pullQuotes[index]}”</blockquote> : null}
          </section>
        ))}
        {draft.seoTitle || draft.seoDescription ? (
          <div className={styles.seo}><b>SEO 제목</b> {draft.seoTitle}<br /><b>SEO 설명</b> {draft.seoDescription}</div>
        ) : null}
      </article>
    </div>
  );
}
