export const OLIVIA_MOBILE_MAX_WIDTH = 820;
export const OLIVIA_COARSE_PORTRAIT_MAX_WIDTH = 900;

export type OliviaSurfaceSignals = {
  width: number;
  height: number;
  coarsePointer?: boolean;
  forceMobilePreview?: boolean;
};

export function shouldUseOliviaMobileSurface(signals: OliviaSurfaceSignals) {
  if (signals.forceMobilePreview) return true;
  if (!Number.isFinite(signals.width) || signals.width <= 0) return false;
  if (signals.width <= OLIVIA_MOBILE_MAX_WIDTH) return true;
  return Boolean(
    signals.coarsePointer
    && signals.width <= OLIVIA_COARSE_PORTRAIT_MAX_WIDTH
    && signals.height >= signals.width,
  );
}

