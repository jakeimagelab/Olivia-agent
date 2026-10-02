type CaptureState = "idle" | "starting" | "recording" | "paused" | "interrupted" | "stopping" | "stopped" | "error";
type StorageState = "none" | "local" | "uploading" | "stored" | "partial" | "failed";

const CAPTURE_IN_PROGRESS = new Set<CaptureState>(["starting", "recording", "paused", "interrupted", "stopping"]);
const STORAGE_IN_PROGRESS = new Set<StorageState>(["local", "uploading", "partial", "failed"]);

/**
 * 유휴 준비 상태는 음성기록 화면 안에서만 보인다. 실제 녹음·저장·복구가 진행 중인
 * 경우에만 다른 Olivia 화면에서도 동일한 세션 조작 바를 유지한다.
 */
export function shouldShowRecordingBar(input: {
  kind: "general" | "interview" | null;
  capture: CaptureState;
  storage: StorageState;
  isVoiceScreen: boolean;
}) {
  if (!input.kind) return false;
  return input.isVoiceScreen || CAPTURE_IN_PROGRESS.has(input.capture) || STORAGE_IN_PROGRESS.has(input.storage);
}

/** 저장 완료된 이전 원본은 새 녹음 시작을 막지 않는다. */
export function canStartNewRecording(kind: "general" | "interview" | null, capture: CaptureState) {
  return Boolean(kind) && ["idle", "stopped", "error"].includes(capture);
}
