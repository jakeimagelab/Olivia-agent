import { decideBoundary } from "./boundary-score";
import { stabilizeBoundaries } from "./boundary-stabilizer";
import { mapWithConcurrency } from "./browserProcessing";
import { analyzeBrowserSceneBoundary } from "./fieldBoundaryAnalysis";
import type { TimestampedBrowserPhoto } from "./fieldScanning";
import type {
  SceneBoundaryDecision,
  SceneBoundaryFeatures,
  SceneClassificationSettings,
  VisualBoundaryCandidate,
} from "./hybrid-types";
import { getClassificationCheckpoint, setClassificationCheckpoint } from "./scene-cache";
import type { MedicalDepartment } from "./types";

type BoundaryCheckpoint = {
  decisions: Record<string, SceneBoundaryDecision>;
};

type BoundaryVerificationProgress = {
  completed: number;
  total: number;
  restored: boolean;
};

type LoadCheckpoint = (checkpointId: string) => Promise<BoundaryCheckpoint | null>;
type SaveCheckpoint = (checkpointId: string, checkpoint: BoundaryCheckpoint) => Promise<void>;

export async function verifyBrowserFieldBoundaries({
  entries,
  candidates,
  settings,
  department,
  checkpointId,
  weights,
  signal,
  onProgress,
  analyzeBoundary = analyzeBrowserSceneBoundary,
  loadCheckpoint = (id) => getClassificationCheckpoint<BoundaryCheckpoint>(id),
  saveCheckpoint = setClassificationCheckpoint,
}: {
  entries: readonly TimestampedBrowserPhoto[];
  candidates: readonly VisualBoundaryCandidate[];
  settings: SceneClassificationSettings;
  department: MedicalDepartment;
  checkpointId: string;
  weights?: SceneBoundaryFeatures;
  signal?: AbortSignal;
  onProgress?: (progress: BoundaryVerificationProgress) => void;
  analyzeBoundary?: typeof analyzeBrowserSceneBoundary;
  loadCheckpoint?: LoadCheckpoint;
  saveCheckpoint?: SaveCheckpoint;
}): Promise<SceneBoundaryDecision[]> {
  const checkpoint = await loadCheckpoint(checkpointId);
  const checkpointDecisions: Record<string, SceneBoundaryDecision> = { ...(checkpoint?.decisions ?? {}) };
  let completed = 0;

  const publishProgress = (restored: boolean) => {
    completed += 1;
    onProgress?.({ completed, total: candidates.length, restored });
  };

  const rawDecisions = await mapWithConcurrency([...candidates], settings.maxConcurrentAiJobs, async (candidate) => {
    const beforeFileName = entries[candidate.boundaryIndex - 1]?.name ?? "";
    const afterFileName = entries[candidate.boundaryIndex]?.name ?? "";
    const checkpointKey = `${beforeFileName}→${afterFileName}`;
    const cachedDecision = checkpointDecisions[checkpointKey];

    if (cachedDecision) {
      publishProgress(true);
      return weights
        ? decideBoundary({ candidate, analysis: cachedDecision.aiAnalysis ?? null, settings, beforeFileName, afterFileName, weights })
        : cachedDecision;
    }

    if (candidate.hardGap) {
      const hardDecision = decideBoundary({ candidate, analysis: null, settings, beforeFileName, afterFileName, weights });
      checkpointDecisions[checkpointKey] = hardDecision;
      await saveCheckpoint(checkpointId, { decisions: checkpointDecisions });
      publishProgress(false);
      return hardDecision;
    }

    try {
      let analysis = await analyzeBoundary({
        entries,
        boundaryIndex: candidate.boundaryIndex,
        windowSize: 3,
        useHighModel: false,
        department,
        signal,
      });
      let decision = decideBoundary({ candidate, analysis, settings, beforeFileName, afterFileName, weights });
      if (decision.decision === "review") {
        analysis = await analyzeBoundary({
          entries,
          boundaryIndex: candidate.boundaryIndex,
          windowSize: 5,
          useHighModel: true,
          department,
          signal,
        });
        decision = decideBoundary({ candidate, analysis, settings, beforeFileName, afterFileName, weights });
      }
      checkpointDecisions[checkpointKey] = decision;
      await saveCheckpoint(checkpointId, { decisions: checkpointDecisions });
      return decision;
    } catch {
      const fallbackDecision = decideBoundary({
        candidate,
        analysis: null,
        settings,
        beforeFileName,
        afterFileName,
        aiFailed: true,
        weights,
      });
      checkpointDecisions[checkpointKey] = fallbackDecision;
      await saveCheckpoint(checkpointId, { decisions: checkpointDecisions });
      return fallbackDecision;
    } finally {
      publishProgress(false);
    }
  });

  return stabilizeBoundaries(rawDecisions, entries.length, settings.minimumSceneImages);
}
