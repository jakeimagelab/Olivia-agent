import { analyzeSceneBoundary, analyzePhotoScene, scanScenePurposes } from "@/lib/photo-classifier/server/sceneAi";
import { analyzeFolderPattern } from "@/lib/photo-classifier/server/folderPatternAi";
import type { PhotoSceneBrain } from "./types";

/** 지금까지의 기본 동작 그대로 — OpenAI Vision을 직접 호출한다(요청서 §9 fallback의 2단계). */
export const localPhotoBrain: PhotoSceneBrain = {
  engine: "openai",
  analyzeBoundary: analyzeSceneBoundary,
  analyzeScene: analyzePhotoScene,
  scanPurpose: scanScenePurposes,
  analyzeFolderPattern,
};
