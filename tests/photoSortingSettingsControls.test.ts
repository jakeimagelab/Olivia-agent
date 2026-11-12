import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldClassificationSettings } from "@/components/photo-classifier/FieldClassificationSettings";
import { PhotoShootingModeControl } from "@/components/photo-classifier/PhotoShootingModeControl";
import { StudioClassificationSettings } from "@/components/photo-classifier/StudioClassificationSettings";
import { PhotoClassificationProgressView } from "@/components/photo-classifier/PhotoClassificationProgressView";
import { FieldSceneReviewOverview } from "@/components/photo-classifier/FieldSceneReviewOverview";

describe("photo sorting settings controls", () => {
  it("renders the selected shooting mode without changing the existing labels", () => {
    const markup = renderToStaticMarkup(
      createElement(PhotoShootingModeControl, {
        mode: "studio",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain("병원 현장촬영");
    expect(markup).toContain("스튜디오 프로필촬영");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("스튜디오 프로필촬영 ✓");
  });

  it("renders field gap, analysis mode, and classification options together", () => {
    const markup = renderToStaticMarkup(
      createElement(FieldClassificationSettings, {
        gapMinutes: 3.5,
        onGapMinutesChange: () => undefined,
        fastAnalyzeMode: false,
        onFastAnalyzeModeChange: () => undefined,
        departmentLogicEnabled: true,
        onDepartmentLogicEnabledChange: () => undefined,
        aiNamingEnabled: true,
        onAiNamingEnabledChange: () => undefined,
        qualityAnalysisEnabled: false,
        onQualityAnalysisEnabledChange: () => undefined,
        profileClassificationEnabled: false,
        onProfileClassificationEnabledChange: () => undefined,
      }),
    );

    expect(markup).toContain("3분30초");
    expect(markup).toContain("정밀 분류 ✓");
    expect(markup).toContain("진료과 로직 사용");
    expect(markup).toContain("AI 씬 이름 추천");
    expect(markup).toContain("품질 분석");
    expect(markup).toContain("프로필 자동 분류 (엄격 모드)");
  });

  it("renders studio grouping, lighting, and file handling settings together", () => {
    const markup = renderToStaticMarkup(
      createElement(StudioClassificationSettings, {
        subMode: "group",
        onSubModeChange: () => undefined,
        groupSortMode: "gap_ai",
        onGroupSortModeChange: () => undefined,
        gapMinutes: 3,
        onGapMinutesChange: () => undefined,
        sourceControl: createElement("div", null, "테스트 폴더 선택"),
        lightingSensitivity: "medium",
        onLightingSensitivityChange: () => undefined,
        fileMode: "copy",
        onFileModeChange: () => undefined,
      }),
    );

    expect(markup).toContain("여러 명 · 같은 컨셉 ✓");
    expect(markup).toContain("시간차 + AI");
    expect(markup).toContain("테스트 폴더 선택");
    expect(markup).toContain("조명 불량 ETC 기준");
    expect(markup).toContain("복사 — 원본을 남기고 분류 폴더에 복사");
  });

  it("keeps only the requested tail of progress logs", () => {
    const markup = renderToStaticMarkup(
      createElement(PhotoClassificationProgressView, {
        title: "분류 중",
        progress: { cur: 2, total: 10, msg: "파일 확인" },
        statusText: "현재 단계: SCANNING",
        logs: ["첫 로그", "중간 로그", "마지막 로그"],
        logLimit: 2,
        onCancel: () => undefined,
        cancelLabel: "분석 중단",
      }),
    );

    expect(markup).not.toContain("첫 로그");
    expect(markup).toContain("중간 로그");
    expect(markup).toContain("마지막 로그");
    expect(markup).toContain("현재 단계: SCANNING");
    expect(markup).toContain("분석 중단");
  });

  it("renders the Bridge scene review status and approval count", () => {
    const markup = renderToStaticMarkup(
      createElement(FieldSceneReviewOverview, {
        bridgePlanSummary: { sceneCount: 4, jpgCount: 120, reviewCount: 2 },
        fastAnalyzeMode: false,
        boundaryReviewCount: 0,
        aiAnalysisPending: true,
        approvedCount: 1,
        sceneCount: 4,
        onApproveAll: () => undefined,
        evaluationMode: false,
        onEvaluationModeChange: () => undefined,
        files: [{ name: "A.JPG" }, { name: "B.JPG" }],
        groundTruthSelection: 1,
        onGroundTruthSelectionChange: () => undefined,
        groundTruthBoundaries: [],
        onGroundTruthBoundariesChange: () => undefined,
        boundaryDecisions: [],
        accuracyReport: null,
        onAccuracyReportChange: () => undefined,
        mergeCandidates: [],
        dismissedCandidates: new Set<string>(),
      }),
    );

    expect(markup).toContain("Bridge 계획 적용됨");
    expect(markup).toContain("Scene 4개");
    expect(markup).toContain("JPG 120장");
    expect(markup).toContain("경계 확인 2곳");
    expect(markup).toContain("AI 분석 중...");
    expect(markup).toContain("승인 1/4");
  });
});
