export function orientedPhotoDimensions(
  width: number,
  height: number,
  orientation?: number | null,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

export function orientedPhotoAspectRatio(width: number, height: number, orientation?: number | null): number {
  const dimensions = orientedPhotoDimensions(width, height, orientation);
  return dimensions.width / dimensions.height;
}

export function aspectRatioWithinTolerance(actual: number, expected: number, tolerance = 0.005): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected <= 0) return false;
  return Math.abs(actual - expected) / expected <= tolerance;
}
