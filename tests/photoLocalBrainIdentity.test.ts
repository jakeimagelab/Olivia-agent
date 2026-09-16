import { describe, expect, it } from "vitest";
import { localPhotoBrain } from "@/lib/photo-classifier/brain/localPhotoBrain";
import { analyzeFolderPattern } from "@/lib/photo-classifier/server/folderPatternAi";
import { analyzePhotoScene, analyzeSceneBoundary, scanScenePurposes } from "@/lib/photo-classifier/server/sceneAi";

// 별도 파일인 이유: photoSceneBrain.test.ts는 localPhotoBrain 모듈을 vi.mock으로 교체하므로
// 그 파일 안에서는 "실제 함수와 동일한 참조인지" 검증이 불가능하다.
describe("localPhotoBrain은 기존 sceneAi.ts/folderPatternAi.ts 함수를 그대로 가리킨다(로직 재작성 없음)", () => {
  it("네 메서드 모두 기존 export와 동일한 함수 참조다", () => {
    expect(localPhotoBrain.analyzeBoundary).toBe(analyzeSceneBoundary);
    expect(localPhotoBrain.analyzeScene).toBe(analyzePhotoScene);
    expect(localPhotoBrain.scanPurpose).toBe(scanScenePurposes);
    expect(localPhotoBrain.analyzeFolderPattern).toBe(analyzeFolderPattern);
    expect(localPhotoBrain.engine).toBe("openai");
  });
});
