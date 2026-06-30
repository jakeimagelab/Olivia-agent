import { SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */
export type GalleryStatus =
  | "draft"
  | "mail_sent"
  | "waiting_selection"
  | "selection_submitted"
  | "raw_matched"
  | "retouching"
  | "completed"
  | "expired";

export interface SelectGallery {
  id: string;
  client_id?: string;
  workflow_run_id?: string;
  title: string;
  hospital_name?: string;
  shooting_name?: string;
  shooting_date?: string;
  share_token: string;
  status: GalleryStatus;
  allow_web_select: boolean;
  allow_download_upload: boolean;
  allow_download_zip: boolean;
  allow_resubmit: boolean;
  total_jpg_count: number;
  selected_count: number;
  file_expires_at: string;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
}

export interface SelectGalleryImage {
  id: string;
  gallery_id: string;
  original_file_name: string;
  basename: string;
  extension: string;
  scene_id?: string;
  scene_name?: string;
  folder_name?: string;
  image_url: string;
  thumbnail_url?: string;
  preview_url?: string;
  width?: number;
  height?: number;
  file_size?: number;
  expires_at: string;
  sort_order: number;
  created_at: string;
}

export interface ClientPhotoSelection {
  id: string;
  client_id?: string;
  workflow_run_id?: string;
  gallery_id: string;
  method: "web_select" | "download_upload";
  selected_files: string[];
  selected_count: number;
  customer_memo?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface SelectRawMatch {
  id: string;
  client_id?: string;
  workflow_run_id?: string;
  gallery_id: string;
  selection_id: string;
  selected_jpg: string;
  selected_basename: string;
  matched_raw?: string;
  raw_extension?: string;
  status: "matched" | "raw_missing" | "duplicate_raw" | "jpg_missing";
  note?: string;
  created_at: string;
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
export function generateShareToken(): string {
  return nanoid(24);
}

export function getFileExpiresAt(days = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function getGalleryByToken(
  sb: SupabaseClient,
  shareToken: string
): Promise<SelectGallery | null> {
  const { data } = await sb
    .from("select_galleries")
    .select("*")
    .eq("share_token", shareToken)
    .single();
  return data ?? null;
}

export async function getGalleryImages(
  sb: SupabaseClient,
  galleryId: string
): Promise<SelectGalleryImage[]> {
  const { data } = await sb
    .from("select_gallery_images")
    .select("*")
    .eq("gallery_id", galleryId)
    .order("sort_order");
  return data ?? [];
}

export async function getLatestSelection(
  sb: SupabaseClient,
  galleryId: string
): Promise<ClientPhotoSelection | null> {
  const { data } = await sb
    .from("client_photo_selections")
    .select("*")
    .eq("gallery_id", galleryId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .single();
  return data ?? null;
}

export async function getRawMatches(
  sb: SupabaseClient,
  galleryId: string
): Promise<SelectRawMatch[]> {
  const { data } = await sb
    .from("select_raw_matches")
    .select("*")
    .eq("gallery_id", galleryId)
    .order("created_at");
  return data ?? [];
}

/* ═══════════════════════════════════════════════
   STATUS LABELS
═══════════════════════════════════════════════ */
export const GALLERY_STATUS_LABEL: Record<GalleryStatus, string> = {
  draft:               "초안",
  mail_sent:           "메일 발송됨",
  waiting_selection:   "셀렉 대기중",
  selection_submitted: "셀렉 완료",
  raw_matched:         "RAW 매칭 완료",
  retouching:          "보정 중",
  completed:           "완료",
  expired:             "만료",
};

export const GALLERY_STATUS_COLOR: Record<GalleryStatus, string> = {
  draft:               "#9BB5B0",
  mail_sent:           "#D97706",
  waiting_selection:   "#2563EB",
  selection_submitted: "#7C3AED",
  raw_matched:         "#059669",
  retouching:          "#155855",
  completed:           "#22876A",
  expired:             "#DC2626",
};
