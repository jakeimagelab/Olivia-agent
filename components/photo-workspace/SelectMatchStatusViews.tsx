"use client";

import type { ReactNode } from "react";
import { CheckCircle2, FolderOpen } from "lucide-react";

import { rawMatchProgressPercent } from "@/lib/photo-bridge/rawMatchDelivery";
import { C } from "@/lib/theme";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";
import type { RawMatchResult } from "./useSelectMatchExecution";
import type { RawDiscoveryState } from "./useSelectMatchPreflight";

export function SelectMatchRawFolderView({
  criteriaPanel,
  bridgeLinked,
  expectedCount,
  discovery,
  targets,
  onCancel,
  onPick,
  colors,
}: {
  criteriaPanel: ReactNode;
  bridgeLinked: boolean;
  expectedCount: number;
  discovery: RawDiscoveryState;
  targets: ReadonlySet<string>;
  onCancel: () => void;
  onPick: () => void;
  colors: SelectMatchControlColors;
}) {
  const discoveryFailed = discovery.status === "not_found" || discovery.status === "error";
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      {criteriaPanel}
      <div style={{ background: colors.surfaceCard, borderRadius: 16, border: `1px solid ${colors.uiBorder}`, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600, color: colors.uiAccent, marginBottom: 6 }}><FolderOpen size={17} aria-hidden="true" />{bridgeLinked ? "RAW 원본 폴더를 자동으로 찾습니다" : "RAW 폴더를 선택하세요"}</div>
        <div style={{ fontSize: 12, color: colors.uiMuted, lineHeight: 1.7, marginBottom: 20 }}>
          {bridgeLinked ? "선택 기준에 맞는" : "고객 선택"} 사진 <strong style={{ color: colors.uiAccent }}>{expectedCount}장</strong>을 확인했습니다.<br />
          {bridgeLinked ? <>선택 사진 1~2장을 기준으로 현재 폴더와 상위 2단계까지만 확인합니다.<br /></> : <>이제 RAW 파일이 들어있는 폴더를 선택하세요.<br /></>}
          매칭된 RAW 파일은 <strong>Selected_RAW/</strong> 폴더에 복사됩니다.
        </div>
        {bridgeLinked ? <div role="status" style={{ background: colors.groupedSurface, border: `1px solid ${discoveryFailed ? "rgba(201,74,30,.55)" : colors.uiBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: discoveryFailed ? "#F0A98C" : colors.uiMuted, marginBottom: 14 }}>
          {discovery.message || "RAW 원본 위치를 확인할 준비가 됐습니다."}
        </div> : null}
        <div style={{ background: colors.groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: colors.uiMuted, marginBottom: 18 }}>
          <div style={{ fontWeight: 500, color: colors.uiAccent, marginBottom: 4 }}>추출된 파일명 샘플</div>
          {Array.from(targets).slice(0, 5).map((name) => <div key={name} style={{ fontFamily: "monospace", fontSize: 11 }}>{name}</div>)}
          {targets.size > 5 ? <div style={{ color: colors.uiHint }}>... 외 {targets.size - 5}개</div> : null}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <SelectMatchButton variant="secondary" onClick={onCancel}>← 취소</SelectMatchButton>
          <SelectMatchButton variant={bridgeLinked ? "secondary" : undefined} onClick={onPick}>{bridgeLinked && discoveryFailed ? "RAW 폴더 직접 지정" : bridgeLinked ? "다른 RAW 폴더 선택" : "RAW 폴더 선택"}</SelectMatchButton>
        </div>
      </div>
    </div>
  );
}

export function SelectMatchSelectionDoneView({
  selectedCount,
  onReset,
  colors,
}: {
  selectedCount: number;
  onReset: () => void;
  colors: SelectMatchControlColors;
}) {
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: colors.surfaceCard, borderRadius: 16, border: `1px solid ${colors.uiBorder}`, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.uiAccent }}>사진 셀렉 완료</div>
        <p style={{ margin: "8px 0 20px", color: colors.uiMuted, fontSize: 12, lineHeight: 1.7 }}>선택한 JPG {selectedCount.toLocaleString("ko-KR")}장을 사진 작업실에 저장했습니다. RAW 매칭 탭에서 이 목록만 사용합니다.</p>
        <SelectMatchButton onClick={onReset}>다시 선택하기</SelectMatchButton>
      </div>
    </div>
  );
}

export function SelectMatchLoadingView({ message, colors }: { message: string; colors: SelectMatchControlColors }) {
  return (
    <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: colors.uiAccent, fontWeight: 500, marginBottom: 12 }}>씬 폴더 스캔 중...</div>
      <div style={{ fontSize: 11, color: colors.uiHint }}>{message}</div>
    </div>
  );
}

export function SelectMatchProgressView({
  progress,
  onCancel,
  colors,
}: {
  progress: { cur: number; total: number; msg: string };
  onCancel: () => void;
  colors: SelectMatchControlColors;
}) {
  const progressPercent = rawMatchProgressPercent(progress.cur, progress.total);
  return (
    <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 24px" }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: colors.uiAccent, marginBottom: 12 }}>RAW 매칭 진행 중...</div>
      <div role="progressbar" aria-label="RAW 매칭 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} style={{ position: "relative", height: 24, background: colors.uiBorder, borderRadius: 7, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${progressPercent}%`, background: colors.uiAccent, borderRadius: 7, transition: "width .2s" }} />
        <strong style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: progressPercent >= 55 ? "#103E36" : colors.uiText, fontSize: 11, fontWeight: 600 }}>{progressPercent}%</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: colors.uiHint, fontSize: 11 }}>
        <span>{progress.msg}</span>
        <span style={{ flex: "0 0 auto" }}>{progress.cur.toLocaleString("ko-KR")} / {progress.total.toLocaleString("ko-KR")}장</span>
      </div>
      <button onClick={onCancel} style={{ marginTop: 12, padding: "6px 16px", background: "transparent", border: `1px solid ${colors.uiBorder}`, borderRadius: 8, fontSize: 12, cursor: "pointer", color: colors.uiMuted, fontFamily: "inherit" }}>중단</button>
    </div>
  );
}

export function SelectMatchDoneView({
  result,
  rawSelectMode,
  rawOutputPath,
  rawOutputOpenError,
  onOpenOutput,
  onAgain,
  onReset,
  colors,
}: {
  result: RawMatchResult;
  rawSelectMode: "move" | "copy";
  rawOutputPath: string;
  rawOutputOpenError: string;
  onOpenOutput: () => void;
  onAgain: () => void;
  onReset: () => void;
  colors: SelectMatchControlColors;
}) {
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: colors.surfaceCard, borderRadius: 16, border: `1px solid ${colors.uiBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px", borderBottom: `1px solid ${colors.uiBorder}`, fontSize: 13, fontWeight: 600, color: result.cancelled ? "#D6BC7D" : C.green }}><CheckCircle2 size={17} aria-hidden="true" />{result.cancelled ? "매칭 중단됨" : "매칭 완료"}</div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "선택 JPG", value: result.selected, color: colors.uiAccent },
              { label: "RAW 매칭", value: result.matched, color: C.green },
              { label: "검증 제외", value: result.missing, color: result.missing > 0 ? "#D6BC7D" : colors.uiHint },
              { label: "실패", value: result.failed, color: result.failed > 0 ? C.red : colors.uiHint },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: colors.inputSurface, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
                <div style={{ fontSize: 10, color: colors.uiHint, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: colors.groupedSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: colors.uiMuted, lineHeight: 1.9, marginBottom: 16 }}>
            <FolderOpen size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 5 }} /><strong style={{ color: colors.uiAccent }}>Selected_RAW/</strong> — 매칭 RAW {rawSelectMode === "move" ? "이동" : "복사"} 완료<br />
            <span style={{ color: colors.uiHint }}>{rawSelectMode === "move" ? "원본 RAW 파일은 삭제되었습니다." : "원본 RAW 파일은 삭제되지 않았습니다."}</span>
          </div>
          <div style={{ background: colors.inputSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: colors.uiText, lineHeight: 1.75, marginBottom: 16 }}>
            RAW {result.matched.toLocaleString("ko-KR")}장 Selected_RAW로 {rawSelectMode === "move" ? "이동" : "복사"}
            {result.alreadyCopied ? <> · 이미 있음 {result.alreadyCopied.toLocaleString("ko-KR")}장</> : null}
            {result.deliveredFolderName ? <> · JPG {result.jpgMoved.toLocaleString("ko-KR")}장(+xmp {result.xmpMoved.toLocaleString("ko-KR")}개) {result.deliveredFolderName}으로 이동</> : null}
            {` · 검증 제외 ${result.missing.toLocaleString("ko-KR")}장 · 실패 ${result.failed.toLocaleString("ko-KR")}장 · _match_log.csv 기록`}
            <br />속성 확인: 통과 {result.attributePassed.toLocaleString("ko-KR")}개 파일 · 실패 {result.attributeFailed.toLocaleString("ko-KR")}개 파일
          </div>
          {result.moveNotice ? <div role="status" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", color: "#D6BC7D", fontSize: 11 }}>{result.moveNotice}</div> : null}
          {rawOutputOpenError ? <div role="status" style={{ marginBottom: 12, color: colors.uiMuted, fontSize: 11 }}>{rawOutputOpenError}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <SelectMatchButton onClick={onOpenOutput} disabled={!rawOutputPath}><FolderOpen size={15} aria-hidden="true" />결과 경로 확인</SelectMatchButton>
            <SelectMatchButton variant="secondary" onClick={onAgain}>← 다시 선택</SelectMatchButton>
            <SelectMatchButton variant="secondary" onClick={onReset}>처음으로</SelectMatchButton>
          </div>
        </div>
      </div>
    </div>
  );
}
