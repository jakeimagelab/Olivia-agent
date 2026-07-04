export type VideoCategory =
  | "SPACE_ONLY"
  | "PEOPLE_CONSULTING"
  | "TREATMENT_SCENE"
  | "CLOSEUP_DETAIL"
  | "NEED_CHECK";

export const VIDEO_CATEGORY_FOLDER: Record<VideoCategory, string> = {
  SPACE_ONLY: "01_공간만_있는_영상",
  PEOPLE_CONSULTING: "02_사람있음_상담대화중심",
  TREATMENT_SCENE: "03_진료시술_연출영상",
  CLOSEUP_DETAIL: "04_얼굴손장비_클로즈업",
  NEED_CHECK: "99_확인필요",
};

export const VIDEO_CATEGORY_ORDER: VideoCategory[] = [
  "SPACE_ONLY",
  "PEOPLE_CONSULTING",
  "TREATMENT_SCENE",
  "CLOSEUP_DETAIL",
  "NEED_CHECK",
];

export interface VideoClipFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;
}

export interface ClassifiedVideo {
  clip: VideoClipFile;
  category: VideoCategory | null;
  categoryKo: string | null;
  confidence: number | null;
  sceneDescription: string | null;
  reason: string | null;
  previewThumbs: string[];
  status: "pending" | "analyzing" | "done" | "error";
}

export interface TimeScene {
  folderName: string;
  clips: VideoClipFile[];
}

export interface VideoStats {
  totalClips: number;
  movedClips: number;
  failedClips: number;
  categoryCounts: Record<string, number>;
}
