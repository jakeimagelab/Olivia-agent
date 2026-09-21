export type OliviaDeviceType = "iphone" | "ipad" | "android-mobile" | "android-tablet" | "desktop";

// components/voice/OliviaRecorder.tsx에 있던 걸 여기로 옮겼다(2026-09-22, 태블릿 화면 분기
// 버그 수정 — docs/tablet-ipad-home-memo-voice-spec.md §1.1). 음성 업로드 메타데이터
// (device_type)에만 쓰이던 걸 lib/olivia/mobile/adaptiveSurface.ts의 화면 분기 신호로도
// 재사용한다 — Mac으로 위장하는 최신 iPadOS UA(Macintosh + 멀티터치)까지 정확히 잡아낸다.
export function detectOliviaDevice(navigatorLike: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): OliviaDeviceType {
  const ua = navigatorLike.userAgent;
  if (/iPhone/i.test(ua)) return "iphone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigatorLike.maxTouchPoints > 1)) return "ipad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "android-mobile" : "android-tablet";
  return "desktop";
}
