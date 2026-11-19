import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveBridgeScenePlanDisabledReason } from "@/components/olivia-bridge/useOliviaBridgeSceneReviewModel";
import type { OliviaBridgeSceneState } from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import { manualPhotoDepartmentResolution } from "@/lib/photo-classifier/departmentResolver";

const COMPLETE_STATE: OliviaBridgeSceneState = {
  status: "complete",
  stage: "Scene 분류 계획 준비됨",
  completed: 12,
  total: 12,
  scenes: [],
  analysis: null,
};

describe("Olivia Bridge Scene 검토 상태", () => {
  it("버튼이 꺼진 정확한 이유를 우선순위대로 알려준다", () => {
    const base = {
      selectedIdCount: 12,
      selectionSource: "olivia" as const,
      sceneState: COMPLETE_STATE,
      selectedSceneAnalysisReady: true,
      departmentResolution: manualPhotoDepartmentResolution("general"),
      departmentLoading: false,
      adobeSelectionLoading: false,
    };

    expect(resolveBridgeScenePlanDisabledReason({ ...base, adobeSelectionLoading: true }))
      .toBe("Adobe Bridge의 별점·컬러를 확인하고 있습니다.");
    expect(resolveBridgeScenePlanDisabledReason({
      ...base,
      selectionSource: "adobe",
      selectedIdCount: 0,
    })).toContain("어도비 기준에서 별점·컬러가 있는 JPG가 없습니다");
    expect(resolveBridgeScenePlanDisabledReason({
      ...base,
      sceneState: { ...COMPLETE_STATE, status: "running", stage: "화면 특징 분석 중", completed: 5 },
      selectedSceneAnalysisReady: false,
    })).toBe("화면 특징 분석 중 · 5/12");
    expect(resolveBridgeScenePlanDisabledReason({
      ...base,
      departmentResolution: { status: "unknown", evidence: [] },
    })).toBeNull();
    expect(resolveBridgeScenePlanDisabledReason(base)).toBeNull();
  });

  it("선택한 JPG만 Scene 창을 열었을 때 분석하고 중복 Adobe 재동기화를 하지 않는다", () => {
    const workspace = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    const analysisHook = readFileSync("components/olivia-bridge/useOliviaBridgeSceneAnalysis.ts", "utf8");
    const toolLaunch = readFileSync("components/olivia-bridge/useOliviaBridgeToolLaunch.ts", "utf8");
    const sceneCache = readFileSync("lib/photo-classifier/scene-cache.ts", "utf8");
    const bridgeFiles = readFileSync("lib/photo-bridge/bridgeFiles.ts", "utf8");

    expect(workspace).toContain("jpgs: sceneAnalysisJpgs");
    expect(workspace).toContain("enabled: sceneReviewOpen");
    expect(workspace).toContain("openTool(\"classification\")");
    expect(workspace).toContain("onOpenSceneReview={openClassificationReview}");
    expect(analysisHook).toContain("if (!enabled || !hasActiveFolder || scanStatus !== \"ready\") return");
    expect(toolLaunch).not.toContain("void syncAdobeBridgeSelection()");
    expect(sceneCache).toContain("export async function getCachedFeatures");
    expect(sceneCache).toContain("export async function setCachedFeatures");
    expect(bridgeFiles).toContain("const cached = await getCachedFeatures(cacheKeys)");
    expect(bridgeFiles).toContain("await setCachedFeatures(cacheEntries)");
  });

  it("Bridge 계획은 이전 원격 실행 모드와 무관하게 Scene 검토로 적용한다", () => {
    const workspace = readFileSync("components/photo-classifier/PhotoSortingWorkspace.tsx", "utf8");

    expect(workspace).toContain("enabled: isEmbedded,");
    expect(workspace).not.toContain("enabled: isEmbedded && executionMode === \"LOCAL_DIRECT\"");
  });
});
