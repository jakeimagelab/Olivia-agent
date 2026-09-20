import { describe, expect, it } from "vitest";
import { buildHermesSystemPrompt } from "@/lib/hermes/systemPrompt";

describe("Hermes 사진 스토리지 도구 라우팅 prompt", () => {
  const prompt = buildHermesSystemPrompt("request-id", {
    activeWorkspace: "quote",
    activeResourceId: "quote-1",
    recentActions: [],
    revision: 1,
  });

  it("활성 견적 context보다 명시적인 NAS 사진 작업을 우선한다", () => {
    expect(prompt).toMatch(/activeResource.*activeWorkspace.*사진 작업이 항상 우선/);
  });

  it("원본 분리와 씬별 분류를 정확한 도구 순서에 연결한다", () => {
    expect(prompt).toMatch(/원본 분리[\s\S]*find_photo_folder[\s\S]*start_photo_source_prep/);
    expect(prompt).toMatch(/씬별 분류[\s\S]*find_photo_folder[\s\S]*start_photo_scene_sort/);
  });

  it("도구를 못 고르거나 폴더 검색이 0건이어도 파일 업로드를 제안하지 않는다", () => {
    expect(prompt).toMatch(/파일 업로드를 대안으로 제안하지 않는다/);
    expect(prompt).toMatch(/NAS 파일 접근 기능이 연결되어 있지 않다.*단정하지 않는다/);
  });
});
