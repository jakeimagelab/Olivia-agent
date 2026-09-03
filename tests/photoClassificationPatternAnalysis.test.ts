import { describe, expect, it } from "vitest";
import {
  computeFolderTimeStats, computeFolderVisualStats, applyOverrides, adjustGranularity,
  DEFAULT_WEIGHT_PROFILE, type SceneWeightProfile,
} from "@/lib/photo-classifier/pattern-analysis";
import { BOUNDARY_WEIGHTS } from "@/lib/photo-classifier/boundary-score";
import type { LocalVisualFeatures } from "@/lib/photo-classifier/hybrid-types";

function feature(dHash: string, brightness = 0.5): LocalVisualFeatures {
  return { dHash, colorHistogram: [1, 0, 0, 0], backgroundGrid: [0.5, 0.5, 0.5], compositionGrid: [0.5, 0.5, 0.5, 0.5], brightness };
}

describe("computeFolderTimeStats", () => {
  it("computes median/p90/p95 for mostly-tight intervals with one large gap", () => {
    // CASE D 스펙: 평소 5초 간격, 갑자기 8분 gap
    const base = Date.parse("2026-01-01T09:00:00Z");
    const mtimes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 8 * 60 + 40].map((s) => base + s * 1000);
    const stats = computeFolderTimeStats(mtimes);
    expect(stats.fileCount).toBe(10);
    expect(stats.medianIntervalSec).toBeCloseTo(5, 5);
    expect(stats.maxIntervalSec).toBeGreaterThan(400);
    expect(stats.largeGapCount).toBe(1);
  });

  it("returns zeroed stats for a single file", () => {
    const stats = computeFolderTimeStats([Date.now()]);
    expect(stats.fileCount).toBe(1);
    expect(stats.medianIntervalSec).toBe(0);
    expect(stats.largeGapCount).toBe(0);
  });
});

describe("computeFolderVisualStats", () => {
  it("returns null when fewer than 2 features are given", () => {
    expect(computeFolderVisualStats([feature("0".repeat(64))])).toBeNull();
  });

  it("reports low change stats for visually identical frames", () => {
    const features = [feature("0".repeat(64)), feature("0".repeat(64)), feature("0".repeat(64))];
    const stats = computeFolderVisualStats(features);
    expect(stats?.meanChangeScore).toBe(0);
    expect(stats?.highChangeRatio).toBe(0);
  });
});

describe("applyOverrides", () => {
  it("boosts personChangeScore weight on high person sensitivity and keeps weights normalized to 1", () => {
    const next = applyOverrides(DEFAULT_WEIGHT_PROFILE, { personSensitivity: "high" });
    expect(next.weights.personChangeScore).toBeGreaterThan(DEFAULT_WEIGHT_PROFILE.weights.personChangeScore);
    const total = Object.values(next.weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("does not mutate weights when no relevant override field is set (CASE A: composition-only change)", () => {
    const next = applyOverrides(DEFAULT_WEIGHT_PROFILE, {});
    expect(next.weights).toEqual(normalize(BOUNDARY_WEIGHTS));
  });

  it("sets a hard absolute time gap boundary from natural language override (CASE F: '5분 이상이면 무조건 나눠줘')", () => {
    const next = applyOverrides(DEFAULT_WEIGHT_PROFILE, { timeGapMode: "hard", absoluteTimeGapMinutes: 5 });
    expect(next.absoluteTimeGapMinutes).toBe(5);
  });

  it("forces a dominant person weight when splitOnPersonChange is requested even across same location (CASE B)", () => {
    const next = applyOverrides(DEFAULT_WEIGHT_PROFILE, { splitOnPersonChange: true });
    // 정규화 이후에도 person 비중이 다른 어떤 항목보다 커야 한다.
    const [topKey] = Object.entries(next.weights).sort((a, b) => b[1] - a[1])[0];
    expect(topKey).toBe("personChangeScore");
  });
});

describe("adjustGranularity", () => {
  it("raises thresholds (fewer scenes) when told the result is too granular (CASE G: '너무 잘게 나눴어')", () => {
    const next = adjustGranularity(DEFAULT_WEIGHT_PROFILE, "coarser");
    expect(next.splitThreshold).toBeGreaterThan(DEFAULT_WEIGHT_PROFILE.splitThreshold);
    expect(next.reviewThreshold).toBeGreaterThan(DEFAULT_WEIGHT_PROFILE.reviewThreshold);
  });

  it("lowers thresholds (more scenes) when asked for finer segmentation", () => {
    const next = adjustGranularity(DEFAULT_WEIGHT_PROFILE, "finer");
    expect(next.splitThreshold).toBeLessThan(DEFAULT_WEIGHT_PROFILE.splitThreshold);
  });

  it("clamps thresholds within a sane range across repeated adjustments", () => {
    let profile: SceneWeightProfile = DEFAULT_WEIGHT_PROFILE;
    for (let i = 0; i < 50; i += 1) profile = adjustGranularity(profile, "coarser");
    expect(profile.splitThreshold).toBeLessThanOrEqual(0.95);
    expect(profile.reviewThreshold).toBeLessThanOrEqual(0.9);
  });
});

function normalize(weights: typeof BOUNDARY_WEIGHTS) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}
