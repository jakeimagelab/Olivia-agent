import type {
  LocalVisualFeatures,
  SceneBoundaryDecision,
  TimestampSource,
} from "@/lib/photo-classifier/hybrid-types";
import type { MedicalDepartment, SceneType } from "@/lib/photo-classifier/types";
import type { SceneClassificationOrigin } from "@/lib/photo-classifier/scene-builder";

export type RunnerWarning = {
  stage: string;
  message: string;
  fileName?: string;
  userVisible?: boolean;
};

export type RemotePhotoSortRunnerOptions = {
  shootingMode: "field" | "studio";
  department: MedicalDepartment;
  gapMinutes: number;
  classificationUiMode: "ai-auto" | "advanced";
  fastAnalyzeMode: boolean;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
};

export type RemotePhotoSortRunnerInput = RemotePhotoSortRunnerOptions & ({
  sourceFolder: string;
  workFolder?: never;
} | {
  sourceFolder?: never;
  workFolder: string;
});

export type RemotePhotoSortSuccess = {
  ok: true;
  status: "COMPLETED";
  sourceFolder: string;
  workFolder: string;
  fileCount: number;
  rawCount: number;
  jpgCount: number;
  sceneCount: number;
  reviewBoundaryCount: number;
  durationMs: number;
  warnings: RunnerWarning[];
};

export type RemotePhotoSortFailure = {
  ok: false;
  status: "FAILED";
  error: string;
};

export type RemotePhotoSortResult = RemotePhotoSortSuccess | RemotePhotoSortFailure;

export type RunnerProgress = {
  stage: "STAGING" | "PREPARING" | "COPYING" | "SCANNING" | "ANALYZING" | "ORGANIZING" | "VERIFYING";
  copiedBytes?: number;
  totalBytes?: number;
  current?: number;
  total?: number;
  message: string;
};

export type NodePhotoEntry = {
  name: string;
  path: string;
  size: number;
  mtime: number;
  timestampSource: TimestampSource;
  warning?: string;
  visualFeatures?: LocalVisualFeatures;
};

export type NodePhotoScene = {
  index: number;
  folderName: string;
  editedName: string;
  startTime: number;
  endTime: number;
  files: NodePhotoEntry[];
  sceneType: SceneType | null;
  classificationOrigin: SceneClassificationOrigin;
  aiConfidence: number | null;
  aiReason: string | null;
  patientPosture?: string | null;
  hasHandpiece?: boolean | null;
  hasTreatmentDevice?: boolean | null;
  hasTreatmentBed?: boolean | null;
  hasConsultationDesk?: boolean | null;
  boundaryBefore?: SceneBoundaryDecision;
};

export type RunnerRoots = {
  sourceRoot: string;
  workRoot: string;
};

export type PreparedWorkFolder = {
  sourceFolder: string;
  workFolder: string;
  staged: boolean;
};
