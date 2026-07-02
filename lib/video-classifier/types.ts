import type { MedicalDepartment, SceneType } from "../photo-classifier/types";

export interface VideoClipFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;          // lastModified
  duration?: number;
  frameThumbUrls?: string[];
}

export interface VideoSceneAnalysisResult {
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
}

export interface VideoScene {
  index: number;
  folderName: string;       // "Scene01" initially
  editedName: string;
  startTime: number;
  endTime: number;
  clips: VideoClipFile[];
  sceneDir: FileSystemDirectoryHandle | null;
  sceneType: SceneType | null;
  suggestedName: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  needsReview: boolean;
  nameLoading: boolean;
}

export interface VideoSortOptions {
  department: MedicalDepartment;
  gapMinutes: number;
}

export interface VideoStats {
  totalClips: number;
  totalScenes: number;
  failedClips: number;
  movedClips: number;
}
