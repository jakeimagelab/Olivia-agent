import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldClassificationSettings } from "@/components/photo-classifier/FieldClassificationSettings";
import { PhotoShootingModeControl } from "@/components/photo-classifier/PhotoShootingModeControl";
import { StudioClassificationSettings } from "@/components/photo-classifier/StudioClassificationSettings";
import { PhotoClassificationProgressView } from "@/components/photo-classifier/PhotoClassificationProgressView";
import { FieldSceneReviewOverview } from "@/components/photo-classifier/FieldSceneReviewOverview";
import { FieldSceneReviewList } from "@/components/photo-classifier/FieldSceneReviewList";
import { FieldSceneMergeCandidateCard } from "@/components/photo-classifier/FieldSceneMergeCandidateCard";
import { StudioGroupEditView } from "@/components/photo-classifier/StudioGroupEditView";
import { StudioGroupConfirmationView } from "@/components/photo-classifier/StudioGroupConfirmationView";
import type { FieldScene } from "@/lib/photo-classifier/types";

function makeFieldScene(index: number, editedName: string): FieldScene {
  return {
    index,
    folderName: `Scene0${index}`,
    editedName,
    startTime: index * 1_000,
    endTime: index * 2_000,
    fileCount: 1,
    files: [{
      name: `${index}.JPG`,
      basename: String(index),
      handle: {} as FileSystemFileHandle,
      mtime: index * 1_000,
      thumbUrl: null,
    }],
    sceneDir: null,
    sceneType: "consultation",
    suggestedName: null,
    aiConfidence: null,
    aiReason: "상담 장면",
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
    approved: true,
  };
}

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

  it("renders field scene details through the extracted review list", () => {
    const scene = makeFieldScene(1, "01_상담");
    const markup = renderToStaticMarkup(
      createElement(FieldSceneReviewList, {
        scenes: [scene],
        totalJpg: 1,
        rawCount: 1,
        departmentLabel: "안과",
        mergeCandidates: [],
        dismissedCandidates: new Set<string>(),
        splitPositions: {},
        onSceneFocus: () => undefined,
        onSceneNameChange: () => undefined,
        onSceneNameCommit: () => undefined,
        onSuggestedNameApply: () => undefined,
        onSplitPositionChange: () => undefined,
        onSplitScene: () => undefined,
        onMergeScenes: () => undefined,
        onApproveScene: () => undefined,
        onDismissCandidate: () => undefined,
      }),
    );

    expect(markup).toContain("씬 검토 — JPG 1장 / RAW 1개 / 안과");
    expect(markup).toContain('value="01_상담"');
    expect(markup).toContain("consultation");
    expect(markup).toContain("상담 장면");
    expect(markup).toContain("승인됨");
  });

  it("renders the extracted merge candidate with both scene names and actions", () => {
    const markup = renderToStaticMarkup(
      createElement(FieldSceneMergeCandidateCard, {
        scene: makeFieldScene(1, "01_상담"),
        nextScene: makeFieldScene(2, "02_시술"),
        candidate: {
          id: "merge-1-2",
          fromFolderName: "Scene01",
          toFolderName: "Scene02",
          fromDisplayName: "01_상담",
          toDisplayName: "02_시술",
          fromSceneType: "consultation",
          toSceneType: "consultation",
          mergeScore: 0.84,
          transitionStrength: 0.16,
          recommendedAction: "merge",
          reason: "인물과 장소가 같습니다.",
          matchedSignals: ["같은 인물", "같은 장소"],
          blockedSignals: [],
        },
        onMerge: () => undefined,
        onKeepSplit: () => undefined,
      }),
    );

    expect(markup).toContain("병합 후보");
    expect(markup).toContain("유사도 84%");
    expect(markup).toContain("01_상담");
    expect(markup).toContain("02_시술");
    expect(markup).toContain("병합하기");
    expect(markup).toContain("분리 유지");
  });

  it("renders concept and person studio groups through the shared edit view", () => {
    const markup = renderToStaticMarkup(
      createElement(StudioGroupEditView, {
        description: "AI 그룹 검토 안내",
        groupHeading: "인물 그룹",
        groupCountUnit: "명",
        etcFiles: [{ name: "DARK.JPG", thumbUrl: null }],
        groups: [{
          id: "person-1",
          kind: "person",
          editedFolderName: "01_인물1",
          files: [{ name: "A.JPG", thumbUrl: null }],
          tags: ["여성", "40대", "안경"],
          index: 1,
        }],
        onFolderNameChange: () => undefined,
        onBack: () => undefined,
        onApprove: () => undefined,
      }),
    );

    expect(markup).toContain("AI 그룹 검토 안내");
    expect(markup).toContain("00_ETC_조명불량");
    expect(markup).toContain("인물 그룹 — 1명 / 1장");
    expect(markup).toContain('value="01_인물1"');
    expect(markup).toContain("여성");
    expect(markup).toContain("안경");
    expect(markup).toContain("승인");
  });

  it("renders studio confirmation tabs, stats, tags, and file actions", () => {
    const markup = renderToStaticMarkup(
      createElement(StudioGroupConfirmationView, {
        groups: [{
          id: "group-1",
          tabLabel: "프로필_셔츠_Standing",
          editedFolderName: "01_프로필_셔츠_Standing",
          isEtc: false,
          files: [{ name: "A.JPG", thumbUrl: null }],
          tags: [{ label: "셔츠" }, { label: "Standing", tone: "orange" }],
        }],
        activeIndex: 0,
        stats: [
          { label: "전체 그룹", value: 1, color: "#7C3AED" },
          { label: "전체 JPG", value: 1, color: "#111111" },
        ],
        onActiveIndexChange: () => undefined,
        onBack: () => undefined,
        onStart: () => undefined,
      }),
    );

    expect(markup).toContain("프로필_셔츠_Standing");
    expect(markup).toContain("전체 그룹");
    expect(markup).toContain("셔츠");
    expect(markup).toContain("Standing");
    expect(markup).toContain("A.JPG");
    expect(markup).toContain("파일 정리 시작");
  });
});
