import type {
  CandidateSegment, LocalVisualFeatures, SceneClassificationSettings,
  TimestampedFile, VisualBoundaryCandidate,
} from "./hybrid-types";
import { medianVisualFeatures, visualChangeScore } from "./visual-feature";

export function sortTimestampedFiles<T extends TimestampedFile>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    const timeDifference = left.mtime - right.mtime;
    return timeDifference !== 0
      ? timeDifference
      : left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function buildCandidateSegments(files: TimestampedFile[], hardGapMinutes: number): CandidateSegment[] {
  if (files.length === 0) return [];
  const hardGapMs = hardGapMinutes * 60_000;
  const segments: CandidateSegment[] = [];
  let startIndex = 0;
  for (let index = 1; index < files.length; index++) {
    if (files[index].mtime - files[index - 1].mtime <= hardGapMs) continue;
    segments.push({ startIndex, endIndex: index - 1, hardBoundaryAfter: true });
    startIndex = index;
  }
  segments.push({ startIndex, endIndex: files.length - 1, hardBoundaryAfter: false });
  return segments;
}

export function buildVisualBoundaryCandidates(
  files: TimestampedFile[],
  features: LocalVisualFeatures[],
  settings: SceneClassificationSettings,
): VisualBoundaryCandidate[] {
  const results: VisualBoundaryCandidate[] = [];
  const windowSize = Math.max(1, settings.scanWindowSize);
  const hardGapMs = settings.hardGapMinutes * 60_000;
  const softGapMs = settings.softGapSeconds * 1_000;
  for (let index = 1; index < files.length; index++) {
    const before = features.slice(Math.max(0, index - windowSize), index);
    const after = features.slice(index, Math.min(features.length, index + windowSize));
    if (before.length === 0 || after.length === 0) continue;
    const score = visualChangeScore(medianVisualFeatures(before), medianVisualFeatures(after));
    const timeGapMs = Math.max(0, files[index].mtime - files[index - 1].mtime);
    const hardGap = timeGapMs > hardGapMs;
    const requiresAi = !hardGap && (
      score >= settings.localCandidateThreshold
      || (timeGapMs >= softGapMs && score >= settings.softGapVisualThreshold)
    );
    if (hardGap || requiresAi) results.push({ boundaryIndex: index, timeGapMs, visualChangeScore: score, hardGap, requiresAi });
  }
  return results;
}
