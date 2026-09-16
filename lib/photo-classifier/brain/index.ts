import { localPhotoBrain } from "./localPhotoBrain";
import { hermesPhotoBrain } from "./hermesPhotoBrain";
import type { PhotoSceneBrain } from "./types";

export type { PhotoSceneBrain } from "./types";
export { localPhotoBrain } from "./localPhotoBrain";
export { hermesPhotoBrain } from "./hermesPhotoBrain";

// 요청서 §14 provider 우선순위: Hermes(PRIMARY) → OpenAI Vision(TOOL/FALLBACK) → Local.
//
// 기본값은 지금까지의 동작(OpenAI 직접)과 100% 동일하다 — 명시적으로 켜야만 Hermes 경로를
// 시도한다. 사진 파이프라인은 RAW 안전 등 실수 여지가 없어야 하는 영역이라, 채팅 Brain
// (OLIVIA_AGENT_ENGINE)과 같은 이유로 opt-in으로 시작한다 — Vercel에서 chat Hermes도 아직
// 기본 off인 것과 동일한 판단이다.
export function getPhotoClassificationEngine(): "hermes" | "local" {
  return process.env.OLIVIA_PHOTO_HERMES_BRAIN?.trim() === "1" ? "hermes" : "local";
}

export function resolvePhotoSceneBrain(): PhotoSceneBrain {
  return getPhotoClassificationEngine() === "hermes" ? hermesPhotoBrain : localPhotoBrain;
}
