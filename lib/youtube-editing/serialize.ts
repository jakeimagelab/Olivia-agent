import type {
  CameraOption, CanvasObject, CaptionConfig, Segment, SegmentAnnotation,
  SoundEffectOption, TemplateOption, TransitionOption, VisualConfig, YoutubeEditingProject,
} from "./types";
import { defaultCaptionConfig, defaultVisualConfig } from "./constants";

export function rowToProject(row: any): YoutubeEditingProject {
  return {
    id: row.id,
    title: row.title ?? "",
    hospitalName: row.hospital_name ?? null,
    fullScript: row.full_script ?? "",
    videoRatio: row.video_ratio ?? "16:9",
    preferredTone: row.preferred_tone ?? null,
    status: row.status ?? "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSegment(row: any): Segment {
  return {
    id: row.id,
    projectId: row.project_id,
    sortOrder: row.sort_order ?? 0,
    scriptText: row.script_text ?? "",
    estimatedDurationSec: row.estimated_duration_sec ?? null,
    camera: Array.isArray(row.camera) ? (row.camera as CameraOption[]) : [],
    caption: row.caption && typeof row.caption === "object" && Object.keys(row.caption).length
      ? { ...defaultCaptionConfig(), ...(row.caption as CaptionConfig) }
      : defaultCaptionConfig(),
    visual: row.visual && typeof row.visual === "object" && Object.keys(row.visual).length
      ? { ...defaultVisualConfig(), ...(row.visual as VisualConfig) }
      : defaultVisualConfig(),
    soundEffect: ((row.sound_effect as SoundEffectOption) || "없음"),
    transition: ((row.transition as TransitionOption) || "컷"),
    template: ((row.template as TemplateOption) || "없음"),
    editingNote: row.editing_note ?? "",
    aiReason: row.ai_reason ?? null,
    confidence: row.confidence ?? null,
    userModified: Boolean(row.user_modified),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToAnnotation(row: any): SegmentAnnotation {
  return {
    segmentId: row.segment_id,
    strokes: Array.isArray(row.strokes) ? row.strokes : [],
    canvasWidth: row.canvas_width ?? null,
    canvasHeight: row.canvas_height ?? null,
  };
}

export function rowToCanvasObject(row: any): CanvasObject {
  const data = (row.object_data ?? {}) as Partial<CanvasObject>;
  return {
    id: row.id,
    type: row.object_type,
    x: data.x ?? 0.1,
    y: data.y ?? 0.1,
    width: data.width ?? 0.2,
    height: data.height ?? 0.15,
    label: data.label ?? "",
    color: data.color ?? "#EAF4F2",
    zIndex: row.sort_order ?? 0,
    poseKey: data.poseKey,
  };
}
