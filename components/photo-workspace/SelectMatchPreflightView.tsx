"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ScanSearch } from "lucide-react";

import { captureMatchSummaryTotal, type CaptureMatchPreflight } from "@/lib/selectMatch/captureMatch";
import { formatCaptureTime } from "@/lib/selectMatch/captureTime";
import { remoteRawMatchRunDisabledReason } from "@/lib/selectMatch/remoteRawMatch";
import { C } from "@/lib/theme";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";
import type { RawDiscoveryState } from "./useSelectMatchPreflight";

export function SelectMatchPreflightView({
  criteriaPanel,
  preflight,
  manualRawChoices,
  setManualRawChoices,
  rawScanCount,
  rawDiscovery,
  expectedTargetCount,
  targetCountMatches,
  approvedMatchCount,
  moveMatchedJpgs,
  onMoveMatchedJpgsChange,
  deliveredFolderName,
  onDeliveredFolderNameChange,
  workerOnline,
  remoteExecutionError,
  onCancel,
  onRun,
  colors,
}: {
  criteriaPanel: ReactNode;
  preflight: CaptureMatchPreflight | null;
  manualRawChoices: Record<string, string>;
  setManualRawChoices: Dispatch<SetStateAction<Record<string, string>>>;
  rawScanCount: number;
  rawDiscovery: RawDiscoveryState;
  expectedTargetCount: number;
  targetCountMatches: boolean;
  approvedMatchCount: number;
  moveMatchedJpgs: boolean;
  onMoveMatchedJpgsChange: (checked: boolean) => void;
  deliveredFolderName: string;
  onDeliveredFolderNameChange: (value: string) => void;
  workerOnline: boolean | null;
  remoteExecutionError: string;
  onCancel: () => void;
  onRun: () => void;
  colors: SelectMatchControlColors;
}) {
  const unresolvedItems = preflight?.items.filter((item) => item.status !== "confirmed") ?? [];
  const manualCount = Object.keys(manualRawChoices).length;
  const summaryTotal = preflight ? captureMatchSummaryTotal(preflight) : 0;
  const runDisabledReason = remoteRawMatchRunDisabledReason(approvedMatchCount, workerOnline);
  const runDisabled = runDisabledReason !== null;

  return (
    <div style={{ maxWidth: 960, margin: "28px auto", padding: "0 24px" }}>
      {criteriaPanel}
      <div style={{ background: colors.surfaceCard, borderRadius: 16, border: `1px solid ${colors.uiBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px", borderBottom: `1px solid ${colors.uiBorder}`, fontSize: 13, fontWeight: 600, color: colors.uiAccent }}>
          <ScanSearch size={16} aria-hidden="true" /> 매칭 사전 확인
        </div>
        {rawDiscovery.folderName ? <div style={{ padding: "9px 20px", borderBottom: `1px solid ${colors.uiBorder}`, color: colors.uiMuted, fontSize: 11 }}>
          RAW 원본 폴더 · <strong style={{ color: colors.uiAccent, fontWeight: 600 }}>{rawDiscovery.folderName}</strong>
        </div> : null}
        {!preflight ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ height: 6, background: colors.uiBorder, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ height: "100%", width: "40%", borderRadius: 3, background: colors.uiAccent, animation: "select-match-scan-bar 1.1s ease-in-out infinite" }} />
            </div>
            <div style={{ fontSize: 12, color: colors.uiHint }}>RAW 후보와 촬영시각 확인 중{rawScanCount > 0 ? ` — ${rawScanCount.toLocaleString()}장 완료` : "..."}</div>
            <style>{`@keyframes select-match-scan-bar { 0% { margin-left: 0%; } 50% { margin-left: 60%; } 100% { margin-left: 0%; } }`}</style>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: 18 }}>
              {[
                { label: "확정", value: preflight.confirmed, color: C.green },
                { label: "촬영시각 불일치", value: preflight.timeMismatch, color: preflight.timeMismatch ? C.red : colors.uiHint },
                { label: "후보 여러 개", value: preflight.multipleCandidates, color: preflight.multipleCandidates ? "#D6BC7D" : colors.uiHint },
                { label: "촬영시각 없음", value: preflight.missingTime, color: preflight.missingTime ? "#D6BC7D" : colors.uiHint },
                { label: "RAW 없음", value: preflight.rawMissing, color: preflight.rawMissing ? C.red : colors.uiHint },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: colors.inputSurface, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
                  <div style={{ fontSize: 10, color: colors.uiHint, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div role="status" style={{ background: colors.groupedSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 9, padding: "10px 13px", color: colors.uiText, fontSize: 12, marginBottom: 16 }}>
              매칭 {preflight.items.length.toLocaleString("ko-KR")}장 = <strong style={{ color: C.green }}>확정 {preflight.confirmed.toLocaleString("ko-KR")}장</strong>
              {` · 촬영시각 불일치 ${preflight.timeMismatch.toLocaleString("ko-KR")}장 · 후보 여러 개 ${preflight.multipleCandidates.toLocaleString("ko-KR")}장 · 촬영시각 없음 ${preflight.missingTime.toLocaleString("ko-KR")}장`}
              {preflight.rawMissing ? ` · RAW 없음 ${preflight.rawMissing.toLocaleString("ko-KR")}장` : ""}
              {manualCount ? <strong style={{ color: colors.uiAccent }}> · 직접 선택 {manualCount.toLocaleString("ko-KR")}장</strong> : null}
            </div>
            {!targetCountMatches ? (
              <div role="alert" style={{ background: "#FEF2F2", border: "1px solid rgba(201,74,30,.35)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                대상 수가 맞지 않습니다. 매칭 기준 {expectedTargetCount.toLocaleString("ko-KR")}장 · 사전 확인 {preflight.items.length.toLocaleString("ko-KR")}장 · 상태 합계 {summaryTotal.toLocaleString("ko-KR")}장입니다. 폴더를 다시 확인해 주세요.
              </div>
            ) : preflight.items.length === 0 ? (
              <div role="alert" style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>촬영시각을 확인할 JPG 원본 파일을 찾지 못했습니다. 파일명 목록만으로는 안전하게 매칭하지 않습니다. JPG가 들어 있는 촬영 폴더를 다시 열어 주세요.</div>
            ) : preflight.rawFound === 0 ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>RAW 파일을 찾지 못했습니다. 상단의 <strong>RAW 폴더 선택</strong> 버튼으로 올바른 폴더를 선택해주세요.</div>
            ) : preflight.confirmed === 0 && manualCount === 0 ? (
              <div style={{ background: "#FEF9C3", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>자동 확정된 RAW가 없습니다. 아래 경로와 촬영시각을 확인하고 필요한 항목만 직접 선택해 주세요.</div>
            ) : null}
            {unresolvedItems.length > 0 ? <div style={{ display: "grid", gap: 10, marginBottom: 18, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {unresolvedItems.map((item) => {
                const statusLabel = item.status === "time_mismatch" ? "촬영시각 불일치" : item.status === "multiple_candidates" ? "후보 여러 개" : item.status === "missing_time" ? "촬영시각 없음" : "RAW 없음";
                return <div key={item.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0, .9fr) minmax(0, 1.5fr)", gap: 12, padding: 12, border: `1px solid ${colors.uiBorder}`, borderRadius: 10, background: colors.inputSurface }}>
                  <div style={{ height: 82, borderRadius: 7, overflow: "hidden", background: "rgba(0,0,0,.28)", display: "grid", placeItems: "center" }}>
                    {item.jpg.thumbUrl ? <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 FileSystemHandle에서 만든 blob 썸네일 */}
                      <img src={item.jpg.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </> : <span style={{ color: colors.uiHint, fontSize: 10 }}>미리보기 없음</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: colors.uiText, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{item.jpg.name}</strong>
                    <span style={{ display: "block", color: colors.uiHint, fontSize: 10, marginTop: 4, overflowWrap: "anywhere" }}>{item.jpg.relativePath}</span>
                    <span style={{ display: "block", color: colors.uiMuted, fontSize: 10, marginTop: 6 }}>{formatCaptureTime(item.jpgCaptureTime)}</span>
                    <span style={{ display: "inline-block", color: item.status === "time_mismatch" || item.status === "raw_missing" ? C.red : "#D6BC7D", fontSize: 10, marginTop: 6, fontWeight: 600 }}>{statusLabel}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {item.candidates.length > 0 ? <>
                      <select
                        aria-label={`${item.jpg.name} RAW 직접 선택`}
                        value={manualRawChoices[item.id] ?? ""}
                        onChange={(event) => setManualRawChoices((current) => {
                          const next = { ...current };
                          if (event.currentTarget.value) next[item.id] = event.currentTarget.value;
                          else delete next[item.id];
                          return next;
                        })}
                        style={{ width: "100%", minHeight: 40, border: `1px solid ${colors.uiBorder}`, borderRadius: 8, background: colors.surfaceCard, color: colors.uiText, padding: "0 9px", font: "inherit", fontSize: 10 }}
                      >
                        <option value="">복사하지 않음</option>
                        {item.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}</option>)}
                      </select>
                      <div style={{ marginTop: 7, display: "grid", gap: 4 }}>
                        {item.candidates.map((candidate) => <div key={candidate.id} style={{ color: colors.uiHint, fontSize: 9, overflowWrap: "anywhere" }}>
                          {candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}{candidate.differenceMs !== null ? ` · 차이 ${(candidate.differenceMs / 1000).toFixed(3)}초` : ""}
                        </div>)}
                      </div>
                      {item.status === "missing_time" && item.candidates.length === 1 && !manualRawChoices[item.id] ? <button
                        type="button"
                        onClick={() => setManualRawChoices((current) => ({ ...current, [item.id]: item.candidates[0].id }))}
                        style={{ marginTop: 8, minHeight: 34, border: `1px solid ${colors.uiBorder}`, borderRadius: 7, background: colors.groupedSurface, color: colors.uiAccent, padding: "0 10px", font: "inherit", fontSize: 10, cursor: "pointer" }}
                      >파일명만으로 매칭</button> : null}
                    </> : <span style={{ color: C.red, fontSize: 10 }}>같은 파일명의 RAW 후보가 없습니다.</span>}
                  </div>
                </div>;
              })}
            </div> : null}
            {approvedMatchCount > 0 ? <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${colors.uiBorder}`, borderRadius: 10, background: colors.groupedSurface }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: colors.uiText, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={moveMatchedJpgs} onChange={(event) => onMoveMatchedJpgsChange(event.currentTarget.checked)} />
                매칭한 JPG를 보정본 폴더로 옮기기
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, opacity: moveMatchedJpgs ? 1 : .45 }}>
                <span style={{ color: colors.uiMuted, fontSize: 11 }}>JPG 폴더 안</span>
                <input
                  value={deliveredFolderName}
                  disabled={!moveMatchedJpgs}
                  aria-label="매칭한 JPG를 옮길 폴더 이름"
                  onChange={(event) => onDeliveredFolderNameChange(event.currentTarget.value)}
                  style={{ minHeight: 38, flex: 1, minWidth: 0, border: `1px solid ${colors.uiBorder}`, borderRadius: 8, background: colors.inputSurface, color: colors.uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
                />
                <span style={{ color: colors.uiMuted, fontSize: 11 }}>폴더</span>
              </div>
              <p style={{ margin: "8px 0 0", color: colors.uiHint, fontSize: 10, lineHeight: 1.55 }}>RAW 복사가 성공한 JPG와 같은 이름의 XMP만 Mac Studio가 이동합니다. 같은 볼륨은 이름만 옮기고, 다른 볼륨은 ditto 복사·속성 확인 후 원본을 지웁니다.</p>
            </div> : null}
            {remoteExecutionError ? <div role="alert" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "#FEF2F2", color: C.red, fontSize: 11 }}>{remoteExecutionError}</div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <SelectMatchButton variant="secondary" onClick={onCancel}>← 취소</SelectMatchButton>
              <SelectMatchButton disabled={runDisabled} onClick={onRun}>RAW 매칭 실행 ({approvedMatchCount.toLocaleString("ko-KR")}장)</SelectMatchButton>
              {runDisabledReason ? <span role="status" style={{ color: C.red, fontSize: 11 }}>{runDisabledReason}</span> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
