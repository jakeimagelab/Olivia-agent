import type { FieldScene, FieldStats, MedicalDepartment } from "@/lib/photo-classifier/types";
import type {
  ClassificationJobState,
  SceneBoundaryDecision,
  SceneCorrection,
} from "@/lib/photo-classifier/hybrid-types";

const SESSION_KEY = "photoclinic-sorting-session-v1";

export interface SavedSortingSession {
  version: 1 | 2;
  savedAt: string;
  step: number;
  rootDirName: string;
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  fieldRawCount: number;
  fieldStats: FieldStats | null;
  classificationJobState?: ClassificationJobState;
  boundaryDecisions?: SceneBoundaryDecision[];
  sceneCorrections?: SceneCorrection[];
  sceneSummary: Array<{
    index: number;
    folderName: string;
    editedName: string;
    startTime: number;
    endTime: number;
    fileCount: number;
    sceneType: string | null;
    suggestedName: string | null;
    aiConfidence: number | null;
    aiReason: string | null;
    fileNames?: string[];
    boundaryBefore?: SceneBoundaryDecision;
    approved?: boolean;
  }>;
}

export function normalizeSavedSortingSession(value: unknown): SavedSortingSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as SavedSortingSession;
  if (session.version !== 1 && session.version !== 2) return null;
  if (!Number.isFinite(session.step) || session.step < 2) return null;
  if (!Array.isArray(session.sceneSummary)) return null;
  return { ...session, step: Math.min(session.step, 4) };
}

export function readSavedSortingSession(storage: Pick<Storage, "getItem">): SavedSortingSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  return normalizeSavedSortingSession(JSON.parse(raw));
}

export function writeSavedSortingSession(
  session: SavedSortingSession,
  storage: Pick<Storage, "setItem">,
) {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function removeSavedSortingSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(SESSION_KEY);
}

export function createSavedSortingSession(input: {
  step: number;
  rootDirName: string;
  department: MedicalDepartment;
  gapMinutes: number;
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  fieldRawCount: number;
  fieldStats: FieldStats | null;
  classificationJobState: ClassificationJobState;
  boundaryDecisions: SceneBoundaryDecision[];
  sceneCorrections: SceneCorrection[];
  fieldScenes: FieldScene[];
  savedAt?: string;
}): SavedSortingSession {
  return {
    version: 2,
    savedAt: input.savedAt ?? new Date().toISOString(),
    step: input.step,
    rootDirName: input.rootDirName,
    department: input.department,
    gapMinutes: input.gapMinutes,
    fastAnalyzeMode: input.fastAnalyzeMode,
    departmentLogicEnabled: input.departmentLogicEnabled,
    aiNamingEnabled: input.aiNamingEnabled,
    qualityAnalysisEnabled: input.qualityAnalysisEnabled,
    profileClassificationEnabled: input.profileClassificationEnabled,
    rawSelectMode: input.rawSelectMode,
    fieldRawCount: input.fieldRawCount,
    fieldStats: input.fieldStats,
    classificationJobState: input.classificationJobState,
    boundaryDecisions: input.boundaryDecisions,
    sceneCorrections: input.sceneCorrections,
    sceneSummary: input.fieldScenes.map((scene) => ({
      index: scene.index,
      folderName: scene.folderName,
      editedName: scene.editedName,
      startTime: scene.startTime,
      endTime: scene.endTime,
      fileCount: scene.fileCount,
      sceneType: scene.sceneType,
      suggestedName: scene.suggestedName,
      aiConfidence: scene.aiConfidence,
      aiReason: scene.aiReason,
      fileNames: scene.files.map((file) => file.name),
      boundaryBefore: scene.boundaryBefore,
      approved: scene.approved,
    })),
  };
}
