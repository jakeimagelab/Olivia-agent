import type { FieldScene, MedicalDepartment } from "./types";

export type SceneAiResponse = {
  ok?: boolean;
  sceneType?: FieldScene["sceneType"];
  suggestedFolderName?: string;
  confidence?: number;
  reason?: string;
  patientPosture?: string;
  hasHandpiece?: boolean;
  hasTreatmentDevice?: boolean;
  hasTreatmentBed?: boolean;
  hasConsultationDesk?: boolean;
  equipmentName?: string;
  equipmentBrand?: string;
  handpieceName?: string;
  procedureName?: string;
  procedureCategory?: string;
  procedureConfidence?: number;
  namingEvidence?: unknown;
};

export type SceneAiTransitionResult = {
  sceneType: string;
  patientPosture?: string;
  hasHandpiece?: boolean;
  hasTreatmentDevice?: boolean;
  confidence: number;
};

export function buildSceneAnalysisSampleIndices(fileCount: number): number[] {
  if (fileCount <= 0) return [];
  const last = fileCount - 1;
  const middle = Math.floor(fileCount / 2);
  return [...new Set([
    0,
    Math.min(1, last),
    middle,
    Math.min(middle + 1, last),
    Math.max(0, last - 1),
    last,
  ])].slice(0, 6);
}

export function applySceneAiResponse(
  scene: FieldScene,
  response: SceneAiResponse,
  options: {
    department: MedicalDepartment;
    departmentLogicEnabled: boolean;
    aiNamingEnabled: boolean;
  },
): { scene: FieldScene; transition: SceneAiTransitionResult | null } {
  if (!response.ok) return { scene: { ...scene, nameLoading: false }, transition: null };
  const dermatologyBaseNaming = options.department === "dermatology" && options.departmentLogicEnabled;
  const namingEnabled = options.aiNamingEnabled || dermatologyBaseNaming;
  const number = String(scene.index).padStart(2, "0");
  const suggestedName = namingEnabled && response.suggestedFolderName
    ? `${number}_${response.suggestedFolderName}`
    : null;
  return {
    scene: {
      ...scene,
      sceneType: response.sceneType ?? null,
      suggestedName,
      aiConfidence: response.confidence ?? null,
      aiReason: response.reason ?? null,
      editedName: suggestedName ?? scene.editedName,
      nameLoading: false,
      aiPatientPosture: response.patientPosture ?? null,
      aiHasHandpiece: response.hasHandpiece ?? null,
      aiHasTreatmentDevice: response.hasTreatmentDevice ?? null,
      aiHasTreatmentBed: response.hasTreatmentBed ?? null,
      aiHasConsultationDesk: response.hasConsultationDesk ?? null,
      aiEquipmentName: response.equipmentName ?? null,
      aiEquipmentBrand: response.equipmentBrand ?? null,
      aiHandpieceName: response.handpieceName ?? null,
      aiProcedureName: response.procedureName ?? null,
      aiProcedureCategory: response.procedureCategory ?? null,
      aiProcedureConfidence: response.procedureConfidence ?? null,
      aiNamingEvidence: Array.isArray(response.namingEvidence) ? response.namingEvidence as string[] : [],
    },
    transition: {
      sceneType: response.sceneType ?? "etc",
      patientPosture: response.patientPosture,
      hasHandpiece: response.hasHandpiece,
      hasTreatmentDevice: response.hasTreatmentDevice,
      confidence: response.confidence ?? 0,
    },
  };
}

export function isDermatologyStrongTransition(
  previous: SceneAiTransitionResult,
  current: SceneAiTransitionResult,
): boolean {
  const consultationTypes = new Set(["doctor_consultation", "manager_consultation", "skin_care"]);
  const treatmentTypes = new Set(["device_treatment", "lifting_laser_treatment", "laser_treatment", "injection_treatment"]);
  if (consultationTypes.has(previous.sceneType) && treatmentTypes.has(current.sceneType)) return true;
  if (previous.patientPosture === "seated" && current.patientPosture === "lying_down") return true;
  if (!previous.hasHandpiece && current.hasHandpiece) return true;
  if (!previous.hasTreatmentDevice && current.hasTreatmentDevice) return true;
  return false;
}

export function markDermatologyTransitionCandidates(
  scenes: FieldScene[],
  results: ReadonlyMap<number, SceneAiTransitionResult>,
): FieldScene[] {
  const updated = [...scenes];
  const indices = [...results.keys()].sort((left, right) => left - right);
  for (let position = 1; position < indices.length; position += 1) {
    const previousIndex = indices[position - 1];
    const currentIndex = indices[position];
    const previous = results.get(previousIndex);
    const current = results.get(currentIndex);
    if (!previous || !current || current.confidence < 0.72 || !isDermatologyStrongTransition(previous, current)) continue;
    updated[currentIndex] = {
      ...updated[currentIndex],
      aiReason: `⚠️ 2차 분리 후보: 이전 씬(${updated[previousIndex].editedName})과 장면 전환 감지 — ${updated[currentIndex].aiReason ?? ""}`,
    };
  }
  return updated;
}
