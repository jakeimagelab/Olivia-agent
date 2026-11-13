"use client";

import type { ClassificationJobState } from "@/lib/photo-classifier/hybrid-types";
import type { StudioPhotoFile, StudioSubMode } from "@/lib/photo-classifier/studioGrouping";
import {
  PhotoClassificationProgressView,
  type PhotoClassificationProgress,
} from "./PhotoClassificationProgressView";
import { C, ProgressBar } from "./PhotoSortingUi";

export function FieldAnalysisProgressStep({
  fastAnalyzeMode,
  progress,
  classificationJobState,
  copyLog,
  onCancel,
}: {
  fastAnalyzeMode: boolean;
  progress: PhotoClassificationProgress;
  classificationJobState: ClassificationJobState;
  copyLog: string[];
  onCancel: () => void;
}) {
  return (
    <PhotoClassificationProgressView
      title={fastAnalyzeMode ? "⚡ 빠른 분석 중 (파일 이동 없음)..." : "🔍 하이브리드 Scene 분석 중..."}
      progress={progress}
      statusText={fastAnalyzeMode ? undefined : `현재 단계: ${classificationJobState}`}
      hideProgressUntilStarted
      logs={copyLog}
      logLimit={20}
      onCancel={fastAnalyzeMode ? undefined : onCancel}
      cancelLabel="분석 중단"
    />
  );
}

export function FieldOutputProgressStep({
  fastAnalyzeMode,
  progress,
  qualityAnalysisEnabled,
  profileClassificationEnabled,
  onCancel,
}: {
  fastAnalyzeMode: boolean;
  progress: PhotoClassificationProgress;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  onCancel: () => void;
}) {
  return (
    <PhotoClassificationProgressView
      title={fastAnalyzeMode ? "📁 폴더 정리 실행 중..." : "분석 중..."}
      progress={progress}
      details={[
        fastAnalyzeMode ? "• RAW 이동 → JPG 씬 폴더 정리 중" : "",
        qualityAnalysisEnabled ? "• 흔들림·조명불량 분석 중" : "",
        profileClassificationEnabled ? "• 프로필 자동 분류 중 (엄격 모드)" : "",
      ].filter(Boolean).join("\n")}
      onCancel={onCancel}
    />
  );
}

export function StudioFileScanProgressStep({ progress }: { progress: PhotoClassificationProgress }) {
  return (
    <PhotoClassificationProgressView
      title="파일 분류 중..."
      titleColor={C.purple}
      progress={progress}
    />
  );
}

export function StudioPhotoAnalysisProgressStep({
  progress,
  studioFiles,
  studioSubMode,
}: {
  progress: PhotoClassificationProgress;
  studioFiles: StudioPhotoFile[];
  studioSubMode: StudioSubMode;
}) {
  const analyzed = studioFiles.filter((file) => file.analyzed).length;
  const total = studioFiles.length;

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.purple }}>
        {studioSubMode === "group" ? "AI 얼굴 분석 중..." : "AI 의상·포즈·조명 분석 중..."}
      </div>
      <ProgressBar cur={analyzed} total={total} msg={progress.msg} />
      <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          ["전체 JPG", total, C.teal],
          ["분석 완료", analyzed, C.green],
          ["ETC 후보", studioFiles.filter((file) => file.groupKey === "__ETC__").length, C.red],
        ].map(([label, value, color]) => (
          <div
            key={label as string}
            style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 14px", textAlign: "center" }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color: color as string }}>{value}</div>
            <div style={{ fontSize: 10, color: C.hint }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudioOutputProgressStep({
  progress,
  copyLog,
}: {
  progress: PhotoClassificationProgress;
  copyLog: string[];
}) {
  return (
    <PhotoClassificationProgressView
      title="스튜디오 파일 정리 중..."
      titleColor={C.purple}
      progress={progress}
      logs={copyLog}
      logColor={(line) => line.startsWith("✅") ? C.green : line.startsWith("❌") ? C.red : C.yellow}
      maxWidth={680}
    />
  );
}
