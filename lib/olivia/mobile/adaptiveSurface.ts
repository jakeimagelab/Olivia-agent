export const OLIVIA_MOBILE_MAX_WIDTH = 820;
export const OLIVIA_COARSE_PORTRAIT_MAX_WIDTH = 900;

export type OliviaSurface = "mobile" | "tablet" | "desktop";

export type OliviaSurfaceSignals = {
  width: number;
  height: number;
  coarsePointer?: boolean;
  forceMobilePreview?: boolean;
  forceTabletPreview?: boolean;
};

export function resolveOliviaSurface(signals: OliviaSurfaceSignals): OliviaSurface {
  if (signals.forceMobilePreview) return "mobile";
  if (signals.forceTabletPreview) return "tablet";
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
