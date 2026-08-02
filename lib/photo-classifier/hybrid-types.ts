import type { MedicalDepartment, SceneFile } from "./types";

export type SceneClassificationMode = "fast" | "precise";
export type ClassificationProfile = "dermatology" | "default";
export type TimestampSource = "datetime_original" | "create_date" | "ifd_datetime" | "mtime" | "filename";

export type SceneClassificationSettings = {
  mode: SceneClassificationMode;
  profile: ClassificationProfile;
  hardGapMinutes: number;
  softGapSeconds: number;
  splitThreshold: number;
  reviewThreshold: number;
  minimumSceneImages: number;
  maximumCandidateImages: number;
  scanWindowSize: number;
  localCandidateThreshold: number;
  softGapVisualThreshold: number;
  usePersonDetection: boolean;
  useFaceEmbedding: boolean;
  useBackgroundEmbedding: boolean;
  useEquipmentDetection: boolean;
  useHighResolutionVerification: boolean;
  maxConcurrentJobs: number;
  maxConcurrentAiJobs: number;
};

export type ClassificationJobState =
  | "IDLE"
  | "SCANNING_FILES"
  | "READING_EXIF"
  | "BUILDING_CANDIDATES"
  | "EXTRACTING_FEATURES"
  | "DETECTING_BOUNDARIES"
  | "VERIFYING_BOUNDARIES"
  | "CREATING_SCENES"
  | "GENERATING_NAMES"
  | "WAITING_REVIEW"
  | "APPROVED"
  | "RAW_MATCHING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type LocalVisualFeatures = {
  dHash: string;
  colorHistogram: number[];
  backgroundGrid: number[];
  compositionGrid: number[];
  brightness: number;
};

export type LocationType =
  | "consultation_room" | "treatment_room" | "laser_room" | "procedure_room"
  | "operating_room" | "lobby" | "corridor" | "interior" | "studio" | "unknown";
export type EquipmentCategory =
  | "laser_device" | "lifting_device" | "injection" | "skin_care_device"
  | "bed" | "consultation_desk" | "camera" | "none" | "unknown";
export type PatientPose = "standing" | "sitting" | "lying" | "closeup" | "unknown";
export type ShotDistance = "wide" | "full" | "medium" | "closeup" | "macro" | "unknown";
// 6종 통일 카테고리 — 진료과별 세부 시술/상담 구분(주사시술/레이저시술/장비시술 등)은
// 분류기 선택지를 늘려 오분류를 키우므로 의도적으로 단순화했다. 세부 시각 단서는
// departments/*.ts의 "시술"/"상담" 항목 안에 합쳐서 유지한다.
export type HybridSceneType =
  | "profile" | "consultation" | "treatment"
  | "skin_care" | "interior" | "etc";

export type SceneFrameAnalysis = {
  peopleCount: number;
  hasDoctor: boolean;
  hasPatient: boolean;
  hasStaff: boolean;
  dominantPersonChanged: boolean;
  personChangeConfidence: number;
  locationType: LocationType;
  locationChanged: boolean;
  locationChangeConfidence: number;
  equipmentPresent: boolean;
  equipmentCategory: EquipmentCategory;
  equipmentChanged: boolean;
  equipmentChangeConfidence: number;
  handpiecePresent: boolean;
  syringePresent: boolean;
  treatmentBedPresent: boolean;
  consultationDeskPresent: boolean;
  patientPose: PatientPose;
  beforePatientPose: PatientPose;
  afterPatientPose: PatientPose;
  shotDistance: ShotDistance;
  beforeShotDistance: ShotDistance;
  afterShotDistance: ShotDistance;
  sceneType: HybridSceneType;
  beforeSceneType: HybridSceneType;
  afterSceneType: HybridSceneType;
  sceneTypeChanged: boolean;
  confidence: number;
  reasons: string[];
};

export type SceneBoundaryFeatures = {
  timeGapScore: number;
  personChangeScore: number;
  locationChangeScore: number;
  equipmentChangeScore: number;
  poseChangeScore: number;
  sceneTypeChangeScore: number;
  visualChangeScore: number;
  shotDistanceChangeScore: number;
};

export type BoundaryDecisionSource = "hard_gap" | "local" | "ai" | "ai_fallback" | "user";

export type SceneBoundaryDecision = {
  boundaryIndex: number;
  beforeFileName: string;
  afterFileName: string;
  score: number;
  decision: "split" | "merge" | "review";
  forced: boolean;
  source: BoundaryDecisionSource;
  reasons: string[];
  features: SceneBoundaryFeatures;
  aiAnalysis?: SceneFrameAnalysis | null;
  needsReview: boolean;
};

export type TimestampedFile = {
  name: string;
  handle: FileSystemFileHandle;
  mtime: number;
  timestampSource: TimestampSource;
  warning?: string;
};

export type CandidateSegment = { startIndex: number; endIndex: number; hardBoundaryAfter: boolean };
export type VisualBoundaryCandidate = {
  boundaryIndex: number;
  timeGapMs: number;
  visualChangeScore: number;
  hardGap: boolean;
  requiresAi: boolean;
};

export type HybridScenePlan = {
  id: string;
  index: number;
  files: SceneFile[];
  startTime: number;
  endTime: number;
  suggestedFolderName: string;
  editedFolderName: string;
  sceneType: HybridSceneType;
  confidence: number;
  boundaryBefore?: SceneBoundaryDecision;
  approved: boolean;
};

export type SceneCorrection = {
  projectId: string;
  boundaryIndex: number;
  boundaryFileName: string;
  previousDecision: "split" | "merge";
  correctedDecision: "split" | "merge";
  action: "merge" | "split" | "rename" | "approve" | "delete_boundary" | "add_boundary";
  features: SceneBoundaryFeatures;
  reason?: string;
  createdAt: string;
};

export type AccuracyReport = {
  boundaryPrecision: number;
  boundaryRecall: number;
  boundaryF1: number;
  scenePurity: number;
  overSegmentationRate: number;
  underSegmentationRate: number;
  predictedBoundaryCount: number;
  groundTruthBoundaryCount: number;
  matchedBoundaryCount: number;
  falsePositiveBoundaries: number[];
  missedBoundaries: number[];
  tolerance: number;
};

export type HybridClassificationInput = {
  department: MedicalDepartment;
  files: TimestampedFile[];
  settings: SceneClassificationSettings;
};
