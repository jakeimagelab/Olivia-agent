import type { AccuracyReport } from "../hybrid-types";

function normalizeBoundaries(boundaries: number[], totalImages: number) {
  return Array.from(new Set(boundaries.filter((value) => value > 0 && value < totalImages))).sort((a, b) => a - b);
}

function labelsFromBoundaries(boundaries: number[], totalImages: number) {
  const labels = new Array<number>(totalImages).fill(0);
  let label = 0;
  let boundaryCursor = 0;
  for (let index = 0; index < totalImages; index++) {
    while (boundaryCursor < boundaries.length && index >= boundaries[boundaryCursor]) {
      label += 1;
      boundaryCursor += 1;
    }
    labels[index] = label;
  }
  return labels;
}

export function evaluateSceneBoundaries(args: {
  predictedBoundaries: number[];
  groundTruthBoundaries: number[];
  totalImages: number;
  tolerance?: number;
}): AccuracyReport {
  const tolerance = args.tolerance ?? 1;
  const predicted = normalizeBoundaries(args.predictedBoundaries, args.totalImages);
  const truth = normalizeBoundaries(args.groundTruthBoundaries, args.totalImages);
  const usedTruth = new Set<number>();
  const matchedPredicted = new Set<number>();
  for (const predictedBoundary of predicted) {
    let bestTruthIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    truth.forEach((truthBoundary, truthIndex) => {
      const distance = Math.abs(predictedBoundary - truthBoundary);
      if (!usedTruth.has(truthIndex) && distance <= tolerance && distance < bestDistance) {
        bestTruthIndex = truthIndex;
        bestDistance = distance;
      }
    });
    if (bestTruthIndex >= 0) {
      usedTruth.add(bestTruthIndex);
      matchedPredicted.add(predictedBoundary);
    }
  }
  const matches = usedTruth.size;
  const precision = predicted.length === 0 ? (truth.length === 0 ? 1 : 0) : matches / predicted.length;
  const recall = truth.length === 0 ? (predicted.length === 0 ? 1 : 0) : matches / truth.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const predictedLabels = labelsFromBoundaries(predicted, args.totalImages);
  const truthLabels = labelsFromBoundaries(truth, args.totalImages);
  let purityTotal = 0;
  const predictedSceneCount = predicted.length + 1;
  for (let scene = 0; scene < predictedSceneCount; scene++) {
    const counts = new Map<number, number>();
    for (let index = 0; index < predictedLabels.length; index++) {
      if (predictedLabels[index] !== scene) continue;
      counts.set(truthLabels[index], (counts.get(truthLabels[index]) ?? 0) + 1);
    }
    purityTotal += Math.max(0, ...counts.values());
  }

  return {
    boundaryPrecision: precision,
    boundaryRecall: recall,
    boundaryF1: f1,
    scenePurity: args.totalImages === 0 ? 1 : purityTotal / args.totalImages,
    overSegmentationRate: predicted.length === 0 ? 0 : (predicted.length - matches) / predicted.length,
    underSegmentationRate: truth.length === 0 ? 0 : (truth.length - matches) / truth.length,
    predictedBoundaryCount: predicted.length,
    groundTruthBoundaryCount: truth.length,
    matchedBoundaryCount: matches,
    falsePositiveBoundaries: predicted.filter((boundary) => !matchedPredicted.has(boundary)),
    missedBoundaries: truth.filter((_, index) => !usedTruth.has(index)),
    tolerance,
  };
}
