import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldClassificationSettings } from "@/components/photo-classifier/FieldClassificationSettings";
import { PhotoShootingModeControl } from "@/components/photo-classifier/PhotoShootingModeControl";

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
});
