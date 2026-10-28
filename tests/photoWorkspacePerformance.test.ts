import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("photo workspace rendering safeguards", () => {
  it("keeps generated thumbnails out of long-lived base64 state", () => {
    const files = [
      "components/photo-workspace/AiPhotoSelectPanel.tsx",
      "components/photo-workspace/PhotoTcutWorkspace.tsx",
      "components/photo-workspace/SelectMatchWorkspace.tsx",
    ];
    for (const file of files) expect(source(file)).not.toContain("toDataURL(");
  });

  it("limits rendered rows and candidates without limiting processing inputs", () => {
    const jpgPrep = source("components/photo-workspace/PhotoJpgPrepWorkspace.tsx");
    const aiSelect = source("components/photo-workspace/AiPhotoSelectPanel.tsx");
    expect(jpgPrep).toContain("const RESULT_ROW_LIMIT = 40");
    expect(jpgPrep).toContain(".slice(0, RESULT_ROW_LIMIT)");
    expect(aiSelect).toContain("const CANDIDATE_PAGE_SIZE = 200");
    expect(aiSelect).toContain("current + CANDIDATE_PAGE_SIZE");
  });

  it("uses actual JPG counts for progress and supports stop without rollback", () => {
    const jpgPrep = source("components/photo-workspace/PhotoJpgPrepWorkspace.tsx");
    expect(jpgPrep).toContain("runProgress.processed / runProgress.total");
    expect(jpgPrep).toContain("stopRequestedRef.current = true");
    expect(jpgPrep).toContain("다시 실행하면 남은 것만 이어서 합니다.");
    expect(jpgPrep).not.toMatch(/남은\s*시간|예상\s*시간/);
  });

  it("polls remote tasks at visible, hidden, and empty-state intervals", () => {
    const statusBar = source("components/olivia-os/PhotoTaskStatusBar.tsx");
    expect(statusBar).toContain('document.visibilityState === "hidden" ? 60_000');
    expect(statusBar).toContain("visibleCount === 0 ? 30_000 : 5_000");
    expect(statusBar).not.toContain("setInterval(");
  });

  it("filters RAW matching scenes by basename without replacing the full selection", () => {
    const rawMatch = source("components/photo-workspace/SelectMatchWorkspace.tsx");
    expect(rawMatch).toContain("nameQuery.toLowerCase().split(/[\\s,]+/)");
    expect(rawMatch).toContain("queryTokens.some((token) => photo.basename.toLowerCase().includes(token))");
    expect(rawMatch).toContain("visibleScenes.map((scene, si)");
    expect(rawMatch).toContain("queryTokens.length > 0 || expanded.has(sourceSceneIndex)");
    expect(rawMatch).toContain("const next = new Set(previous)");
    expect(rawMatch).toContain("검색 결과 {matchedCount}장 선택");
    expect(rawMatch).toContain("setSelected(new Set(scenes.flatMap");
  });
});
