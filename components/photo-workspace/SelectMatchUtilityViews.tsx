"use client";

import type { ReactNode } from "react";
import { CheckCircle2, FolderOpen, ListOrdered, Smartphone } from "lucide-react";

import { C } from "@/lib/theme";
import type { SequenceCheckResult } from "@/lib/selectMatch/workspaceHelpers";
import { formatMissingSequenceRange, type SequenceCheckStep } from "./useSelectMatchSequenceCheck";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";

const PROGRAM_ARCHIVE_ITEMS = [
  {
    title: "PhotoClinic Mobile 1500px",
    meta: "Mac 전용 · 사진 변환",
    desc: "원본 사진 폴더를 선택하면 긴 변 1500px JPG로 변환하고 같은 위치의 Mobile_폴더명 폴더에 저장합니다.",
    href: "/assets/tools/mobile-convert/PhotoClinicMobile1500_fixed.zip",
  },
];

export function SelectMatchProgramArchiveView({
  featureTabs,
  colors,
}: {
  featureTabs: ReactNode;
  colors: SelectMatchControlColors;
}) {
  return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 20px" }}>
      {featureTabs}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <Smartphone size={28} aria-hidden="true" style={{ marginBottom: 8, color: colors.uiAccent }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.uiAccent }}>모바일 자동화 &gt; 프로그램 아카이브</div>
        <div style={{ fontSize: 12, color: colors.uiMuted, marginTop: 4 }}>사진 작업실에서 사용하는 자동화 프로그램을 모아둔 자료실입니다.</div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {PROGRAM_ARCHIVE_ITEMS.map((item) => (
          <div key={item.href} style={{
            background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14,
            padding: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 16,
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: colors.uiHint, marginBottom: 5 }}>{item.meta}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: colors.uiText, marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: colors.uiMuted, lineHeight: 1.7 }}>{item.desc}</div>
            </div>
            <a href={item.href} download style={{
              display: "inline-block", padding: "9px 16px", borderRadius: 10,
              background: colors.uiAccent, color: colors.surfaceCard, fontSize: 12, fontWeight: 500,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>다운로드</a>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SelectMatchSequenceCheckView({
  featureTabs,
  step,
  rootDir,
  result,
  hasFileSystemAccess,
  onPickFolder,
  onRun,
  onReset,
  colors,
}: {
  featureTabs: ReactNode;
  step: SequenceCheckStep;
  rootDir: FileSystemDirectoryHandle | null;
  result: SequenceCheckResult | null;
  hasFileSystemAccess: boolean;
  onPickFolder: () => void;
  onRun: () => void;
  onReset: () => void;
  colors: SelectMatchControlColors;
}) {
  if (step === "idle") return (
    <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
      {featureTabs}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <ListOrdered size={28} aria-hidden="true" style={{ marginBottom: 8, color: colors.uiAccent }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.uiAccent }}>파일 순서 검토</div>
        <div style={{ fontSize: 12, color: colors.uiMuted, marginTop: 4 }}>폴더를 지정하면 파일명 끝자리 번호(예: DSC03532 → 3532)로 넘버링이 끊긴 곳(누락 파일)이 있는지 검사합니다.</div>
      </div>
      <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24, textAlign: "center" }}>
        {!hasFileSystemAccess ? (
          <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
        ) : (
          <>
            <SelectMatchButton onClick={onPickFolder}>{rootDir ? <><CheckCircle2 size={16} aria-hidden="true" />{rootDir.name}</> : <><FolderOpen size={16} aria-hidden="true" />폴더 선택</>}</SelectMatchButton>
            <div style={{ fontSize: 11, color: colors.uiHint, marginTop: 10 }}>선택한 폴더의 하위 폴더까지 전부 검사합니다 — 파일이 여러 폴더에 나뉘어 있어도 파일명 기준으로 하나의 순서로 검사합니다.</div>
            {rootDir ? <div style={{ marginTop: 16 }}><SelectMatchButton onClick={onRun}>순서 검토 시작</SelectMatchButton></div> : null}
          </>
        )}
      </div>
    </div>
  );

  if (step === "scanning") return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: colors.uiMuted }}>폴더를 스캔하는 중...</div>
    </div>
  );

  if (!result) return null;
  const hasMissing = result.missingRanges.length > 0;
  return (
    <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
      {featureTabs}
      <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiText, marginBottom: 4 }}>
          총 {result.totalFiles}개 파일
          {result.min !== null && result.max !== null && ` · 번호 범위 ${result.min}~${result.max}`}
        </div>
        {result.recognizedNumbers.length === 0 ? (
          <div style={{ background: colors.inputSurface, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: colors.uiMuted, marginTop: 12 }}>번호를 인식할 수 있는 파일이 없습니다.</div>
        ) : result.rangeTooLarge ? (
          <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginTop: 12 }}>⚠️ 번호 범위가 비정상적으로 커서({result.min}~{result.max}) 검사할 수 없습니다. 파일명에 날짜·시간 등 다른 숫자가 섞여 잘못 인식됐을 가능성이 있습니다.</div>
        ) : hasMissing ? (
          <div style={{ background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#C2410C", marginBottom: 6 }}>⚠️ 누락 {result.missingRanges.length}건</div>
            <div style={{ fontSize: 12, color: colors.uiText, lineHeight: 1.8 }}>{result.missingRanges.map(formatMissingSequenceRange).join(", ")}</div>
          </div>
        ) : (
          <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "12px 14px", marginTop: 12, fontSize: 13, fontWeight: 500, color: C.green }}>✅ 번호가 모두 연속되어 있습니다. 누락된 파일이 없습니다.</div>
        )}
        {result.unrecognizedFiles.length > 0 ? (
          <div style={{ background: colors.inputSurface, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiMuted, marginBottom: 6 }}>번호 인식 불가 (검사에서 제외됨) {result.unrecognizedFiles.length}개</div>
            <div style={{ fontSize: 11, color: colors.uiHint, maxHeight: 120, overflowY: "auto" }}>{result.unrecognizedFiles.join(", ")}</div>
          </div>
        ) : null}
      </div>
      <div style={{ textAlign: "center" }}><SelectMatchButton variant="secondary" onClick={onReset}>← 다시 선택</SelectMatchButton></div>
    </div>
  );
}
