export type MedicalDepartment =
  | "dermatology"
  | "dentistry"
  | "ophthalmology"
  | "orthopedics_neurosurgery"
  | "pediatrics"
  | "korean_medicine"
  | "plastic_surgery"
  | "obgyn"
  | "internal_medicine_checkup"
  | "general";

export type DermatologySceneType =
  | "manager_consultation"
  | "skin_care"
  | "doctor_consultation"
  | "laser_treatment"
  | "device_treatment"
  | "injection_treatment"
  | "profile"
  | "interior"
  | "reception"
  | "etc";

export type OrthoNeuroRehabSceneType =
  | "xray"
  | "c_arm_procedure"
  | "ultrasound_procedure"
  | "doctor_consultation"
  | "physical_therapy"
  | "shockwave_manual_therapy"
  | "harmony"
  | "profile"
  | "interior"
  | "reception"
  | "etc";

export type DentistrySceneType =
  | "info_desk"
  | "manager_consultation"
  | "doctor_consultation"
  | "harmony"
  | "dental_treatment"
  | "implant_surgery"
  | "profile"
  | "interior"
  | "etc";

export type PlasticSurgerySceneType =
  | "manager_consultation"
  | "doctor_consultation"
  | "surgery_scene"
  | "injection_treatment"
  | "lifting_laser_treatment"
  | "harmony"
  | "doctor_treatment"
  | "profile"
  | "interior"
  | "reception"
  | "etc";

export type SceneType =
  | DermatologySceneType
  | OrthoNeuroRehabSceneType
  | DentistrySceneType
  | PlasticSurgerySceneType
  | "unknown";

export type PatientPosture = "seated" | "lying_down" | "standing" | "unclear";

export type RawIndexItem = {
  basename: string;
  fileName: string;
  extension: string;
  handle: FileSystemFileHandle;
};

export type ProfileDetectionResult = {
  isProfile: boolean;
  confidence: number;
  mainPersonCount: number;
  hasPatient: boolean;
  isLookingAtCamera: boolean;
  hasIntentionalPose: boolean;
  hasTool: boolean;
  hasMedicalDevice: boolean;
  hasHandpiece: boolean;
  hasSyringe: boolean;
  hasConsultationObject: boolean;
  isConsultation: boolean;
  isTreatment: boolean;
  isProcedure: boolean;
  reason: string;
};

export type PhotoSceneAnalysisResult = {
  department: MedicalDepartment;
  sceneId: string;
  sceneType: string;
  displayName: string;
  suggestedFolderName: string;
  confidence: number;
  detectedCues: string[];
  negativeCues: string[];
  reason: string;
  needsReview: boolean;
  // 피부과 2차 분리용 추가 필드
  patientPosture?: PatientPosture;
  hasTreatmentDevice?: boolean;
  hasHandpiece?: boolean;
  hasTreatmentBed?: boolean;
  hasConsultationDesk?: boolean;
};

export interface DepartmentSceneRule {
  sceneType: SceneType;
  displayName: string;
  folderName: string;
  description: string;
  priority: number;
  visualCues: string[];
  requiredCues?: string[];
  negativeCues?: string[];
  contextRules?: {
    includeNearbyWithinMinutes?: number;
    includeNearbyIfSamePeople?: boolean;
    includeNearbyIfSameRoom?: boolean;
  };
}

export interface DepartmentClassificationConfig {
  department: MedicalDepartment;
  displayName: string;
  sceneTypes: DepartmentSceneRule[];
  promptGuide: string;
  folderNameRules: {
    prefixFormat: string;
    useKoreanFolderName: boolean;
  };
}

export interface FieldSortOptions {
  department: MedicalDepartment;
  gapMinutes: number;
  departmentLogicEnabled: boolean;
  aiNamingEnabled: boolean;
  qualityAnalysisEnabled: boolean;
  profileClassificationEnabled: boolean;
  rawSelectMode: "move" | "copy";
  fastAnalyzeMode: boolean;
}

export interface SceneFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;          // EXIF time or lastModified
  thumbUrl?: string | null;
  visualVec?: number[];
}

export interface SubScene {
  sceneType: SceneType;
  folderName: string;
  files: SceneFile[];
  confidence: number;
  reason: string;
  confirmed: boolean;
}

export interface FieldScene {
  index: number;
  folderName: string;       // "Scene01" initially
  editedName: string;
  startTime: number;
  endTime: number;
  fileCount: number;
  files: SceneFile[];
  sceneDir: FileSystemDirectoryHandle | null;
  // Dept analysis
  sceneType: SceneType | null;
  suggestedName: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  // Sub-scenes (2차 분리 후보)
  subScenes: SubScene[];
  // Stats
  profileCount: number;
  qualityRejectCount: number;
  nameLoading: boolean;
}

export interface FieldStats {
  totalJpg: number;
  totalRaw: number;
  totalScenes: number;
  totalSubScenes: number;
  totalProfile: number;
  totalQualityReject: number;
  selectedJpg: number;
  selectedRawMoved: number;
  rawMissing: number;
}

export const DEPARTMENT_DISPLAY: Record<MedicalDepartment, string> = {
  dermatology: "피부과",
  dentistry: "치과",
  ophthalmology: "안과",
  orthopedics_neurosurgery: "정형외과/신경외과",
  pediatrics: "소아과",
  korean_medicine: "한의원",
  plastic_surgery: "성형외과",
  obgyn: "산부인과",
  internal_medicine_checkup: "내과/검진센터",
  general: "기타",
};
