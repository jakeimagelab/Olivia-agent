import { describe, expect, it } from "vitest";
import { detectOliviaDevice } from "@/lib/device/detectDevice";

// components/voice/OliviaRecorder.tsx에 있던 detectVoiceDevice()를 lib/device/detectDevice.ts로
// 옮겼다(2026-09-22, 태블릿 화면 분기에도 재사용하기 위해). 동작은 그대로 유지한다.
describe("detectOliviaDevice", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 0, "iphone"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 0, "ipad"],
    // 최신 iPadOS는 Safari에서 Mac으로 위장한다 — 멀티터치(maxTouchPoints>1)로만 구분 가능.
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, "ipad"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, "desktop"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5, "android-mobile"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) Mobile", 5, "android-mobile"],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710)", 5, "android-tablet"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "desktop"],
  ] as const)("userAgent=%s maxTouchPoints=%i -> %s", (userAgent, maxTouchPoints, expected) => {
    expect(detectOliviaDevice({ userAgent, maxTouchPoints })).toBe(expected);
  });
});
