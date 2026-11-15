"use client";
/* eslint-disable @next/next/no-img-element -- Private signed previews are intentionally rendered without the image optimizer. */

import Link from "next/link";
import { Check, CircleAlert, CircleDot, SlidersHorizontal, Sparkles } from "lucide-react";

import type { usePersonSelectImportController } from "@/components/person-select/admin/hooks/usePersonSelectImportController";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type Controller = ReturnType<typeof usePersonSelectImportController>;

const SIGNAL = {
  pass: { label: "통과", icon: Check, className: styles.colorMatchPass },
  check: { label: "확인", icon: CircleDot, className: styles.colorMatchCheck },
  review: { label: "다시 보기", icon: CircleAlert, className: styles.colorMatchReview },
  "no-skin": { label: "피부 없음", icon: CircleDot, className: styles.colorMatchNoSkin },
} as const;

function Delta({ value, signal }: { value: number | null; signal: keyof typeof SIGNAL }) {
  const entry = SIGNAL[signal];
  const Icon = entry.icon;
  return <span className={`${styles.colorMatchDelta} ${entry.className}`}><strong>{value === null ? "—" : value.toFixed(1)}</strong><Icon size={12} />{entry.label}</span>;
}

export function ColorMatchPanel({ controller, eventId, workerOnline }: { controller: Controller; eventId: string; workerOnline: boolean | null }) {
  const {
    path,
    brightness,
    setBrightness,
    skinTone,
    setSkinTone,
    targetMode,
    setTargetMode,
    referenceFile,
    setReferenceFile,
    colorMatchJobId,
    colorMatchResult,
    colorMatchStatus,
    startColorMatch,
  } = controller;
  const disabledReason = !path
    ? "보정본 폴더를 먼저 선택하세요."
    : workerOnline !== true
      ? "Mac Studio가 꺼져 있어요."
      : !brightness && !skinTone
        ? "밝기 또는 얼굴·바디 톤 중 하나를 선택하세요."
        : targetMode === "reference" && !referenceFile.trim()
          ? "기준 사진 파일명을 입력하세요."
          : "";
  const busy = Boolean(colorMatchJobId);
  return <section className={styles.colorMatchPanel} aria-labelledby="color-match-title">
    <div className={styles.colorMatchHeading}>
      <div><span className={styles.stepNumber}>2</span><div><h3 id="color-match-title">색 맞춤</h3><p>AI 추정 없이 얼굴·바디의 실제 픽셀 밝기와 색을 맞춥니다.</p></div></div>
      <button type="button" className={styles.secondary} disabled={busy || Boolean(disabledReason)} onClick={() => void startColorMatch()}><Sparkles size={15} />{busy ? "색 맞춤 중" : "색 맞춤"}</button>
    </div>
    <div className={styles.colorMatchControls}>
      <label><input type="checkbox" checked={brightness} onChange={(event) => setBrightness(event.target.checked)} />밝기 맞추기</label>
      <label><input type="checkbox" checked={skinTone} onChange={(event) => setSkinTone(event.target.checked)} />얼굴·바디 톤 맞추기</label>
      <div className={styles.segment} aria-label="색 맞춤 기준">
        <button type="button" className={targetMode === "median" ? styles.segmentActive : ""} onClick={() => setTargetMode("median")}>전체 중앙값</button>
        <button type="button" className={targetMode === "reference" ? styles.segmentActive : ""} onClick={() => setTargetMode("reference")}>기준 사진 1장</button>
      </div>
      {targetMode === "reference" ? <input className={styles.input} value={referenceFile} onChange={(event) => setReferenceFile(event.target.value)} placeholder="기준 사진 파일명 (예: IMG_1024.JPG)" aria-label="기준 사진 파일명" /> : null}
    </div>
    {disabledReason ? <p className={styles.disabledReason}>{disabledReason}</p> : null}
    {colorMatchStatus && ("error" in colorMatchStatus || !colorMatchResult) ? <div className={"error" in colorMatchStatus ? styles.warning : styles.result}>{String(colorMatchStatus.error ?? colorMatchStatus.message ?? "색 맞춤을 준비하고 있어요.")}</div> : null}
    {colorMatchResult ? <div className={styles.colorMatchResult}>
      <div className={styles.deliveryStep}><span className={styles.stepNumber}>3</span><div><strong>결과 확인</strong><p className={styles.summary}>기준 얼굴색과의 차이와 전후 사진을 확인하세요.</p></div></div>
      <div className={styles.result}>결과 폴더: {colorMatchResult.outputVirtualPath} — 보정본 올리기 경로로 바꿨어요.{colorMatchResult.files.some((file) => file.convertedToSrgb) ? " · sRGB로 변환함" : ""}</div>
      <div className={styles.colorMatchCompare}>
        <div><strong>원본</strong><div>{colorMatchResult.files.slice(0, 8).map((file) => file.sourcePreviewUrl ? <img key={file.relativePath} src={file.sourcePreviewUrl} alt={`${file.fileName} 원본`} /> : null)}</div></div>
        <div><strong>색 맞춤</strong><div>{colorMatchResult.files.slice(0, 8).map((file) => file.resultPreviewUrl ? <img key={file.relativePath} src={file.resultPreviewUrl} alt={`${file.fileName} 색 맞춤`} /> : null)}</div></div>
      </div>
      <div className={styles.colorMatchRows}>{colorMatchResult.files.map((file) => <Link key={file.relativePath} href={`/person-select/${eventId}/color-match?file=${encodeURIComponent(file.relativePath)}`} className={styles.colorMatchRow}>
        <span>{file.fileName}</span><Delta value={file.deltaBefore} signal={file.signalBefore} /><span aria-hidden="true">→</span><Delta value={file.deltaAfter} signal={file.signalAfter} />
      </Link>)}</div>
      <div className={styles.colorMatchSummary}><strong>{colorMatchResult.summary.total.toLocaleString()}장</strong><span>통과 {colorMatchResult.summary.pass}</span><span>확인 {colorMatchResult.summary.check}</span><span>다시 보기 {colorMatchResult.summary.review}</span>{colorMatchResult.summary.noSkin ? <span>피부 없음 {colorMatchResult.summary.noSkin}</span> : null}<time dateTime={colorMatchResult.updatedAt}>{new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(Math.round((new Date(colorMatchResult.updatedAt).getTime() - Date.now()) / 60_000), "minute")}</time></div>
      <p className={styles.summary}>숫자 = 기준 얼굴색과의 차이 (2 이하 통과 · 4 이하 확인 · 그 이상 다시 보기)</p>
      <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button type="button" className={styles.secondary} disabled={busy || workerOnline !== true} onClick={() => void startColorMatch()}><Sparkles size={15} />다시 색 맞춤</button><Link className={styles.weak} href={`/person-select/${eventId}/color-match`}><SlidersHorizontal size={15} />수동 편집</Link></div>
    </div> : null}
  </section>;
}
