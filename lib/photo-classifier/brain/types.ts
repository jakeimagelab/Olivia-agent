import type { analyzeSceneBoundary, analyzePhotoScene, scanScenePurposes } from "@/lib/photo-classifier/server/sceneAi";
import type { analyzeFolderPattern } from "@/lib/photo-classifier/server/folderPatternAi";

// Olivia OS 2.0 — 사진분류 AI를 Hermes Brain 중심 구조로 전환(요청서 §1).
//
// remotePhotoSortRunner.ts의 기존 AiAdapter가 이미 이 4개 슬롯(folderPattern/purposeScan/
// boundary/scene)으로 나뉘어 있었다 — 새 타입 체계를 만들지 않고 그 함수 시그니처(typeof)를
// 그대로 인터페이스로 승격시켰을 뿐이다. profile(프로필 판정)은 Anthropic 기반의 별개
// 관심사이고 Scene 경계 판단과 무관해 이 Brain에 포함하지 않는다(요청서 §14 — 새 Anthropic
// 의존성 금지).
//
// 반환 타입은 지금과 100% 동일하다(SceneFrameAnalysis 등) — "관찰 결과" 모양 자체가 이미
// 최종 판정(boundary-score.ts의 decideBoundary/forcedReasons)과 분리돼 있어서, 이 인터페이스가
// 바꾸는 건 "누가 그 관찰 결과를 만드는가"뿐이다.
export interface PhotoSceneBrain {
  readonly engine: "hermes" | "openai" | "local";
  analyzeBoundary: typeof analyzeSceneBoundary;
  analyzeScene: typeof analyzePhotoScene;
  scanPurpose: typeof scanScenePurposes;
  analyzeFolderPattern: typeof analyzeFolderPattern;
}
