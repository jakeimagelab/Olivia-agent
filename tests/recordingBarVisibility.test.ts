import { describe, expect, it } from "vitest";
import { canStartNewRecording, shouldShowRecordingBar } from "@/lib/voice/recordingBarVisibility";

describe("recording bar visibility", () => {
  it("유휴 음성 준비 바는 음성 화면에서만 보인다", () => {
    expect(shouldShowRecordingBar({ kind: "general", capture: "idle", storage: "none", isVoiceScreen: true })).toBe(true);
    expect(shouldShowRecordingBar({ kind: "general", capture: "idle", storage: "none", isVoiceScreen: false })).toBe(false);
    expect(shouldShowRecordingBar({ kind: "general", capture: "stopped", storage: "stored", isVoiceScreen: false })).toBe(false);
  });

  it("실제 녹음 및 저장/복구 중에는 화면 이동 후에도 보인다", () => {
    expect(shouldShowRecordingBar({ kind: "interview", capture: "recording", storage: "none", isVoiceScreen: false })).toBe(true);
    expect(shouldShowRecordingBar({ kind: "general", capture: "stopped", storage: "uploading", isVoiceScreen: false })).toBe(true);
    expect(shouldShowRecordingBar({ kind: "general", capture: "stopped", storage: "partial", isVoiceScreen: false })).toBe(true);
  });

  it("저장 완료 후에는 즉시 새 녹음을 시작할 수 있다", () => {
    expect(canStartNewRecording("general", "stopped")).toBe(true);
    expect(canStartNewRecording("interview", "idle")).toBe(true);
    expect(canStartNewRecording("general", "recording")).toBe(false);
  });
});
