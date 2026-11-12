"use client";

import { useEffect } from "react";
import { Link2, X } from "lucide-react";
import type {
  PersonSelectRawLabelNames,
  PersonSelectRawMatchMode,
  PersonSelectRawMatchPathPlan,
  PersonSelectRawMatchSource,
} from "@/lib/person-select/rawMatch";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type RawMatchReviewer = {
  id: string;
  display_name: string;
  role_label: string | null;
};

export function RawMatchDialog({ mode, onModeChange, source, onSourceChange, labelNames, onLabelNamesChange, isShared, reviewerScope, onReviewerScopeChange, reviewers, selectedCount, submittedCount, currentCount, pathPlan, busy, disabledReason, onClose, onRun }: {
  mode: PersonSelectRawMatchMode;
  onModeChange: (mode: PersonSelectRawMatchMode) => void;
  source: PersonSelectRawMatchSource;
  onSourceChange: (source: PersonSelectRawMatchSource) => void;
  labelNames: PersonSelectRawLabelNames;
  onLabelNamesChange: (labels: PersonSelectRawLabelNames) => void;
  isShared: boolean;
  reviewerScope: string;
  onReviewerScopeChange: (scope: string) => void;
  reviewers: RawMatchReviewer[];
  selectedCount: number;
  submittedCount: number;
  currentCount: number;
  pathPlan: PersonSelectRawMatchPathPlan;
  busy: boolean;
  disabledReason: string;
  onClose: () => void;
  onRun: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);
  return <div className={styles.modalBackdrop} onClick={() => { if (!busy) onClose(); }}>
    <section className={`${styles.pinDialog} ${styles.rawMatchDialog}`} role="dialog" aria-modal="true" aria-labelledby="raw-match-title" onClick={(event) => event.stopPropagation()}>
      <div className={styles.modalTop}><div><p className={styles.eyebrow}>관리자 실행</p><h2 id="raw-match-title">RAW 실행 확인</h2><p>{mode === "mark" ? "RAW 원본은 수정하지 않고 옆의 XMP에 고객 별점과 컬러를 기록합니다." : "원본은 변경하지 않고 확정된 RAW만 Selected_RAW 폴더로 복사합니다."}</p></div><button type="button" className={styles.weak} aria-label="닫기" disabled={busy} onClick={onClose}><X size={20} /></button></div>
      <fieldset className={styles.rawMatchOptions}><legend>실행 방식</legend><label><input autoFocus type="radio" name="raw-mode" value="copy" checked={mode === "copy"} onChange={() => onModeChange("copy")} /><span><strong>RAW 매칭</strong> — Selected_RAW로 복사</span></label><label><input type="radio" name="raw-mode" value="mark" checked={mode === "mark"} onChange={() => onModeChange("mark")} /><span><strong>로우 셀렉</strong> — 원본 RAW에 고객 별점·컬러 표시</span></label></fieldset>
      <fieldset className={styles.rawMatchOptions}><legend>매칭할 셀렉</legend><label><input type="radio" name="raw-source" value="submitted" checked={source === "submitted"} onChange={() => onSourceChange("submitted")} />최종 제출본만</label><label><input type="radio" name="raw-source" value="current" checked={source === "current"} onChange={() => onSourceChange("current")} />지금 고른 상태 <small>제출 전 포함</small></label></fieldset>
      {isShared ? <div className={styles.field}><label htmlFor="raw-reviewer-scope">검토자</label><select id="raw-reviewer-scope" className={styles.select} value={reviewerScope} onChange={(event) => onReviewerScopeChange(event.target.value)}><option value="all">전체 합집합</option>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""}</option>)}</select></div> : null}
      {mode === "mark" ? <div className={styles.rawLabelSettings}><span>컬러 라벨 이름</span>{([6, 7, 8, 9] as const).map((value) => <label key={value}><b>{value}</b><input className={styles.input} value={labelNames[value]} maxLength={80} onChange={(event) => onLabelNamesChange({ ...labelNames, [value]: event.target.value })} /></label>)}</div> : null}
      <dl className={styles.rawMatchPaths}>
        <div><dt>JPG 위치</dt><dd>{pathPlan.sourcePath || "연결 필요"}</dd></div>
        <div><dt>RAW 검색 범위</dt><dd>{pathPlan.shootingPath || "연결 필요"}</dd></div>
        <div><dt>{mode === "mark" ? "표시 위치" : "결과 저장 위치"}</dt><dd>{mode === "mark" ? `${pathPlan.shootingPath || "연결 필요"} · RAW 옆 XMP` : pathPlan.outputPath || "연결 필요"}</dd></div>
      </dl>
      <div className={styles.rawMatchCount}><strong>매칭할 사진 {selectedCount.toLocaleString()}장</strong><span>제출본 {submittedCount.toLocaleString()}장 · 제출 전 {currentCount.toLocaleString()}장</span></div>
      {disabledReason ? <div className={styles.warning} role="alert">{disabledReason}</div> : null}
      <div className={styles.modalActions}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>취소</button><button type="button" className={styles.primary} disabled={busy || Boolean(disabledReason) || selectedCount === 0} onClick={onRun}><Link2 size={15} />{busy ? "시작 중" : mode === "mark" ? "로우 셀렉 실행" : "RAW 매칭 실행"}</button></div>
    </section>
  </div>;
}

export function RawMatchResult({ result, at, busy, onClear, onRetry }: { result: Record<string, unknown> | null; at: string | null; busy: boolean; onClear: () => void; onRetry: () => void }) {
  if (!result) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  if (result.message && result.matchedCount === undefined) return <div className={styles.result}>{String(result.message)}</div>;
  if (result.error) {
    const diagnostics = result.diagnostics && typeof result.diagnostics === "object" ? result.diagnostics as Record<string, unknown> : null;
    return <div className={styles.rawFailure} role="alert"><strong>실패 · {String(result.error)}</strong><span>단계: {String(result.stage ?? "확인 필요")} · {new Date().toLocaleString("ko-KR")}</span><div><details><summary>자세히</summary><pre>{JSON.stringify(diagnostics ?? result, null, 2)}</pre></details><button type="button" className={styles.secondary} disabled={busy} onClick={onRetry}>다시 시도</button></div></div>;
  }
  if (result.cleared === true) {
    return <div className={styles.result}>{`로우 셀렉 지우기 · 기존 값 복원 ${Number(result.restoredCount ?? 0)}개 · 새 XMP 삭제 ${Number(result.deletedCount ?? 0)}개 · 실패 ${list(result.failed).length}개`}</div>;
  }
  if (result.mode === "mark") {
    const reviewRequired = list(result.reviewRequired);
    const failed = list(result.markFailures);
    return <div className={styles.result}>
      <div className={styles.rawResultLine}><span>{`로우 셀렉${at ? ` (${new Date(at).toLocaleString("ko-KR")})` : ""} · 별점 ${Number(result.ratingCount ?? 0)}장 · 컬러 ${Number(result.colorCount ?? 0)}장 · 확인 필요 ${reviewRequired.length + failed.length}장 · 충돌 ${Number(result.conflictCount ?? 0)}장`}</span><button type="button" className={styles.secondary} disabled={busy || !Array.isArray(result.markedSidecars) || !result.markedSidecars.length} onClick={() => { if (window.confirm("이번 로우 셀렉 작업에서 바꾼 XMP를 이전 값으로 복원할까요? 새로 만든 XMP는 삭제됩니다.")) onClear(); }}>로우 셀렉 지우기</button></div>
      {failed.length ? <ul className={styles.failureList}>{failed.map((item, index) => <li key={`mf-${index}`}>{String(item.raw)}: {String(item.error)}</li>)}</ul> : null}
    </div>;
  }
  const missing = list(result.missing); const ambiguous = list(result.ambiguous); const conflicts = list(result.conflicts); const notSubmitted = Array.isArray(result.notSubmitted) ? result.notSubmitted.map(String) : [];
  const reviewRequired = list(result.reviewRequired);
  const sourceLabel = result.source === "current" ? "제출 전 포함" : "최종 제출본";
  const storageLabel = typeof result.storageRootLabel === "string" ? result.storageRootLabel : "촬영 폴더";
  const rawSearchPath = typeof result.rawSearchRelativePath === "string"
    ? result.rawSearchRelativePath.replace(/^root-\d+\/?/u, "")
    : "";
  const outputPath = String(result.outputRelativePath ?? "Selected_RAW");
  const destination = [storageLabel, rawSearchPath, outputPath].filter(Boolean).join("/");
  const reviewRequiredCount = reviewRequired.length || missing.length + ambiguous.length + conflicts.length;
  const reviewReason = (reason: unknown) => reason === "time_mismatch" ? "촬영시각 불일치" : reason === "multiple_candidates" ? "후보 여러 개" : reason === "missing_time" ? "촬영시각 없음" : reason === "raw_missing" ? "RAW 없음" : reason === "conflict" ? "대상 파일 충돌" : reason === "copy_failed" ? "RAW 복사 실패" : "확인 필요";
  return <div className={styles.result}>
    <div>{`RAW 매칭${at ? ` (${new Date(at).toLocaleString("ko-KR")})` : ""} · ${sourceLabel} · 고른 사진 ${Number(result.selectedCount ?? 0)}장 · 새로 복사 ${Number(result.matchedCount ?? 0)}장 · 이미 있음 ${Number(result.alreadyCopiedCount ?? 0)}장 · 확인 필요 ${reviewRequiredCount}장 → ${destination}`}</div>
    {notSubmitted.length ? <div className={styles.skippedFolders}>미제출로 빠진 사람: {notSubmitted.join(" / ")}</div> : null}
    {reviewRequired.length ? <ul className={styles.failureList}>{reviewRequired.map((item, index) => <li key={`r-${index}`}>{String(item.owner)} · {String(item.jpg)}: {reviewReason(item.reason)}{item.stage ? ` · ${String(item.stage)}` : ""}{item.error ? ` · ${String(item.error)}` : ""}{Array.isArray(item.candidates) && item.candidates.length ? ` (${item.candidates.length}개 후보)` : ""}</li>)}</ul> : <>
      {missing.length ? <ul className={styles.failureList}>{missing.map((item, index) => <li key={`m-${index}`}>{String(item.name)} · {String(item.jpg)}: RAW를 찾지 못했어요</li>)}</ul> : null}
      {ambiguous.length ? <ul className={styles.failureList}>{ambiguous.map((item, index) => <li key={`a-${index}`}>{String(item.name)} · {String(item.jpg)}: 같은 이름의 RAW가 여러 개라 직접 확인이 필요해요 ({Array.isArray(item.candidates) ? item.candidates.length : 0}개)</li>)}</ul> : null}
      {conflicts.length ? <ul className={styles.failureList}>{conflicts.map((item, index) => <li key={`c-${index}`}>{String(item.name)} · {String(item.raw)}: 같은 이름의 다른 파일이 이미 있어 덮어쓰지 않았어요</li>)}</ul> : null}
    </>}
  </div>;
}
