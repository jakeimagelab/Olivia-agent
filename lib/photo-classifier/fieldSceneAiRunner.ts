import { getApiThumb } from "./browserProcessing";
import { withTimeout } from "./browserFileOps";
import { buildMergeCandidates } from "./scene-merge-candidate";
import type { SceneMergeCandidate } from "./scene-merge-types";
import {
  applySceneAiResponse,
  buildSceneAnalysisSampleIndices,
  markDermatologyTransitionCandidates,
  type SceneAiResponse,
  type SceneAiTransitionResult,
} from "./sceneAiAnalysis";
import { runStudioAnalysisConcurrently } from "./studioAnalysisRunner";
import type { FieldScene, MedicalDepartment } from "./types";

async function requestSceneAnalysis(
  scene: FieldScene,
  department: MedicalDepartment,
): Promise<SceneAiResponse> {
  const images: Array<{ fileName: string; base64: string }> = [];
  for (const sampleIndex of buildSceneAnalysisSampleIndices(scene.files.length)) {
    try {
      const photo = scene.files[sampleIndex];
      const file = await photo.handle.getFile();
      images.push({ fileName: photo.name, base64: await getApiThumb(file) });
    } catch (error) {
      console.error("[OLIVIA] Suppressed error", error);
    }
  }
  return withTimeout((async () => {
    const response = await fetch("/api/photo-scene-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        department,
        sceneId: scene.folderName,
        images,
        options: { useHighModel: false },
      }),
    });
    return response.json() as Promise<SceneAiResponse>;
  })(), 45_000, "AI 씬 분석");
}

export async function runFieldSceneAiAnalysis({
  scenes,
  department,
  departmentLogicEnabled,
  aiNamingEnabled,
  onProgress,
  analyze = requestSceneAnalysis,
}: {
  scenes: readonly FieldScene[];
  department: MedicalDepartment;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  onProgress?: (scenes: FieldScene[]) => void;
  analyze?: (scene: FieldScene, department: MedicalDepartment, index: number) => Promise<SceneAiResponse>;
}): Promise<{
  scenes: FieldScene[];
  mergeCandidates: SceneMergeCandidate[] | null;
  errors: Array<{ index: number; message: string }>;
}> {
  const transitions = new Map<number, SceneAiTransitionResult>();
  const errors: Array<{ index: number; message: string }> = [];
  let updated = await runStudioAnalysisConcurrently({
    items: scenes.map((scene) => ({ ...scene })),
    concurrency: 1,
    analyze: async (scene, index) => {
      const response = await analyze(scene, department, index);
      const applied = applySceneAiResponse(scene, response, {
        department,
        departmentLogicEnabled,
        aiNamingEnabled,
      });
      if (applied.transition) transitions.set(index, applied.transition);
      return applied.scene;
    },
    recover: (error, scene, index) => {
      errors.push({ index, message: error instanceof Error ? error.message : String(error) });
      return { ...scene, nameLoading: false };
    },
    onProgress: ({ items }) => onProgress?.(items),
  });

  if (department === "dermatology" && transitions.size >= 2) {
    updated = markDermatologyTransitionCandidates(updated, transitions);
    onProgress?.([...updated]);
  }

  if (updated.length < 2) return { scenes: updated, mergeCandidates: null, errors };
  const snapshots = updated.map((scene) => ({
    folderName: scene.folderName,
    editedName: scene.editedName,
    sceneType: scene.sceneType ?? "",
    patientPosture: scene.aiPatientPosture,
    hasHandpiece: scene.aiHasHandpiece,
    hasTreatmentDevice: scene.aiHasTreatmentDevice,
    hasTreatmentBed: scene.aiHasTreatmentBed,
    hasConsultationDesk: scene.aiHasConsultationDesk,
  }));
  return {
    scenes: updated,
    mergeCandidates: buildMergeCandidates(snapshots, department),
    errors,
  };
}
