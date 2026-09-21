export const OLIVIA_MOBILE_MAX_WIDTH = 820;
export const OLIVIA_COARSE_PORTRAIT_MAX_WIDTH = 900;

export type OliviaSurface = "mobile" | "tablet" | "desktop";

export type OliviaSurfaceSignals = {
  width: number;
  height: number;
  coarsePointer?: boolean;
  forceMobilePreview?: boolean;
  forceTabletPreview?: boolean;
  /** lib/device/detectDevice.ts의 detectOliviaDevice() 결과. docs/tablet-ipad-home-memo-voice-spec.md
   * §1.1 — width 휴리스틱만으로는 세로모드 iPad(Pro 11" 포함)가 거의 다 "mobile"로 잘못
   * 분류된다. 실제 기기가 iPad/안드로이드 태블릿으로 확인되면 폭/방향과 무관하게 tablet을
   * 우선한다 — 이 신호가 없거나 다른 값이면(웹뷰에서 UA를 못 읽는 등) 기존 width 휴리스틱으로
   * 그대로 폴백한다(회귀 없음). */
  deviceType?: "iphone" | "ipad" | "android-mobile" | "android-tablet" | "desktop";
};

export function resolveOliviaSurface(signals: OliviaSurfaceSignals): OliviaSurface {
  if (signals.forceMobilePreview) return "mobile";
  if (signals.forceTabletPreview) return "tablet";
  if (signals.deviceType === "ipad" || signals.deviceType === "android-tablet") return "tablet";
  if (!Number.isFinite(signals.width) || signals.width <= 0) return "desktop";
  if (signals.width <= OLIVIA_MOBILE_MAX_WIDTH) return "mobile";
  if (
    signals.coarsePointer
    && signals.width <= OLIVIA_COARSE_PORTRAIT_MAX_WIDTH
    && signals.height >= signals.width
  ) return "mobile";
  if (signals.coarsePointer && signals.width > OLIVIA_COARSE_PORTRAIT_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function shouldUseOliviaMobileSurface(signals: OliviaSurfaceSignals) {
  return resolveOliviaSurface(signals) === "mobile";
}
