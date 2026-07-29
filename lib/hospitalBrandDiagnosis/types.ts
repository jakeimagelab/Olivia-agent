export type DiagnosisChannel =
  | "website"
  | "naver_place"
  | "naver_blog"
  | "instagram"
  | "youtube"
  | "other";

export type CollectionMethod =
  | "html"
  | "api"
  | "browser"
  | "screenshot"
  | "uploaded_image"
  | "uploaded_video";

export type SourceStatus =
  | "pending"
  | "collecting"
  | "complete"
  | "partial"
  | "failed"
  | "manual_required";

export type ConfidenceLevel =
  | "high"
  | "medium"
  | "low";

export interface HospitalBrandProfile {
  hospitalName: string;
  specialty: string;
  region?: string;
  primaryTreatments: string[];
  targetPatients?: string[];
  desiredImages: string[];
  coreStrengths: string[];
  currentConcerns: string[];
}

export interface DiagnosisSource {
  id: string;
  channel: DiagnosisChannel;
  url?: string;
  collectionMethod: CollectionMethod;
  status: SourceStatus;
  evidenceCount: number;
  collectedAt?: string;
  limitations: string[];
}

export interface UploadedAsset {
  id: string;
  channel: DiagnosisChannel;
  category?: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  consent: boolean;
}

export interface EvidenceItem {
  id: string;
  statement: string;
  channel: DiagnosisChannel;
  sourceType: CollectionMethod;
  sourceId?: string;
  reference?: string;
  confidence: ConfidenceLevel;
}

export interface ScoreValue {
  value: number | null;
  reason: string;
  evidenceIds: string[];
}

export interface ChannelScores {
  informationClarity: ScoreValue;
  visualUtilization: ScoreValue;
  brandConsistency: ScoreValue;
  channelSuitability: ScoreValue;
  technicalReadiness: ScoreValue;
}

export interface VisualComposition {
  category: string;
  count: number;
  ratio: number;
}

export interface ChannelDiagnosisResult {
  channel: DiagnosisChannel;
  summary: string;
  scores: ChannelScores;
  strengths: string[];
  missingInformation: string[];
  immediateActions: string[];
  reusableAssets: string[];
  unavailableChecks: string[];
  evidenceIds: string[];
}

export interface CrossChannelDiagnosis {
  desiredVsActual: {
    desiredImage: string[];
    actualImage: string[];
    alignedPoints: string[];
    gaps: string[];
  };
  consistentMessages: string[];
  inconsistencies: string[];
  duplicatedAssets: string[];
  outdatedInformation: string[];
  visualComposition: VisualComposition[];
  channelRoleProblems: string[];
}

export interface HospitalBrandDiagnosisReport {
  id: string;
  clientId?: string;
  profile: HospitalBrandProfile;
  sources: DiagnosisSource[];
  channelResults: ChannelDiagnosisResult[];
  crossChannel: CrossChannelDiagnosis;
  evidence: EvidenceItem[];
  overallSummary: string;
  strengths: string[];
  missingInformation: string[];
  immediateActions: string[];
  reuseMap: {
    assetId?: string;
    assetDescription: string;
    recommendedChannels: DiagnosisChannel[];
    reason: string;
  }[];
  limitations: string[];
  createdAt: string;
  updatedAt: string;
}

export type DiagnosisProgressStatus =
  | "draft"
  | "collecting"
  | "waiting_manual_upload"
  | "analyzing"
  | "completed"
  | "failed";

export type VisualCategory =
  | "doctor_profile"
  | "staff_group"
  | "consultation"
  | "treatment"
  | "examination"
  | "medical_equipment"
  | "interior"
  | "exterior"
  | "wayfinding"
  | "patient_information"
  | "graphic_card"
  | "product"
  | "video_thumbnail"
  | "other";

export type VideoAnalysisStatus =
  | "not_requested"
  | "metadata_only"
  | "thumbnail_only"
  | "keyframes"
  | "full_analysis"
  | "unsupported"
  | "failed";

export type HistoryItem = {
  id: string; hospital_name: string; specialty: string;
  status: DiagnosisProgressStatus; created_at: string; updated_at: string;
};

export type ActionStatus = "todo" | "in_progress" | "completed" | "deferred";

export interface DiagnosisAction {
  id: string;
  diagnosisId: string;
  channel: DiagnosisChannel | null;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  status: ActionStatus;
  createdAt: string;
  completedAt?: string | null;
}

export interface VideoAnalysisSummary {
  status: VideoAnalysisStatus;
  duration?: number;
  width?: number;
  height?: number;
  frameCount?: number;
  analyzedFrameCount?: number;
  thumbnailAnalyzed: boolean;
  subtitleAnalyzed: boolean;
  titleAnalyzed: boolean;
  limitations: string[];
}
