import path from "node:path";
import type { RunnerRoots } from "./types";

export const PHOTO_SOURCE_ROOT_ENV = "OLIVIA_PHOTO_SOURCE_ROOT";
export const PHOTO_WORK_ROOT_ENV = "OLIVIA_PHOTO_WORK_ROOT";

function requiredAbsoluteRoot(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되어 있지 않습니다. SSD1/SSD2 Storage Root를 설정해주세요.`);
  }
  if (!path.isAbsolute(value) || value.includes("\0")) {
    throw new Error(`${name}은(는) 안전한 절대경로여야 합니다.`);
  }
  return path.normalize(value);
}

/**
 * Production runner의 유일한 Storage Root 진입점.
 * 테스트는 runRemotePhotoSortRunner/preparePrimaryPhotoProject의 roots 주입을 사용한다.
 */
export function getStorageRoots(env: NodeJS.ProcessEnv = process.env): RunnerRoots {
  return {
    sourceRoot: requiredAbsoluteRoot(env, PHOTO_SOURCE_ROOT_ENV),
    workRoot: requiredAbsoluteRoot(env, PHOTO_WORK_ROOT_ENV),
  };
}
