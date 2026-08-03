import type { SceneBoundaryDecision } from "./hybrid-types";

export function stabilizeBoundaries(
  decisions: SceneBoundaryDecision[],
  totalImages: number,
  minimumSceneImages: number,
): SceneBoundaryDecision[] {
  const active = decisions
    .filter((decision) => decision.decision !== "merge")
    .sort((left, right) => left.boundaryIndex - right.boundaryIndex);
  const keep = new Set(active.map((decision) => decision.boundaryIndex));
  let changed = true;
  while (changed) {
    changed = false;
    const boundaries = [0, ...Array.from(keep).sort((a, b) => a - b), totalImages];
    for (let index = 1; index < boundaries.length; index++) {
      if (boundaries[index] - boundaries[index - 1] >= minimumSceneImages) continue;
      const leftDecision = active.find((decision) => decision.boundaryIndex === boundaries[index - 1]);
      const rightDecision = active.find((decision) => decision.boundaryIndex === boundaries[index]);
      const removable = [leftDecision, rightDecision]
        .filter((decision): decision is SceneBoundaryDecision => Boolean(decision))
        .filter((decision) => !decision.forced && decision.score < 0.82)
        .sort((left, right) => left.score - right.score)[0];
      if (removable) {
        keep.delete(removable.boundaryIndex);
        changed = true;
        break;
      }
    }
  }
  return decisions.map((decision) => keep.has(decision.boundaryIndex) || decision.decision === "merge"
    ? decision
    : { ...decision, decision: "merge", needsReview: true, reasons: [...decision.reasons, "짧은 Scene 안정화로 인접 Scene에 병합"] });
}
