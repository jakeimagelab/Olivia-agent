import type { PersonSelectRawImage, PersonSelectRawMatchSource } from "@/lib/person-select/rawMatch";
import type { getSupabaseAdmin } from "@/lib/supabase";

export type RawMatchDb = ReturnType<typeof getSupabaseAdmin>;

export type LoadRawMatchTargetsInput = {
  db: RawMatchDb;
  eventId: string;
  accessMode: string;
  binarySelection?: boolean;
  source: PersonSelectRawMatchSource;
  reviewerIds?: string[];
};

export type ChoiceRow = {
  person_id: string;
  image_id: string;
  updated_at?: string | null;
  person_select_images: SharedImageRow | null;
};

export type PersonRow = {
  id: string;
  display_name: string;
  submitted_at?: string | null;
};

export type ReviewerRow = {
  id: string;
  display_name: string;
  active?: boolean | null;
};

export type SharedDraftItem = {
  image_id?: string;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

export type SharedDraftRow = {
  reviewer_id: string;
  updated_at?: string | null;
  items: SharedDraftItem[] | null;
};

export type SharedSelectionRow = {
  id: string;
  reviewer_id: string;
  submitted_at?: string | null;
};

export type SharedSelectionItemRow = {
  selection_id: string;
  image_id: string;
  customer_rating?: number | null;
  customer_color_label?: number | null;
};

export type SharedImageRow = {
  id: string;
  original_file_name: string;
  source_rel_path: string;
};

export function rawMatchImageRow(
  value: SharedImageRow,
  marks: Partial<PersonSelectRawImage> = {},
): PersonSelectRawImage {
  return {
    id: value.id,
    originalFileName: value.original_file_name,
    sourceRelPath: value.source_rel_path,
    ...marks,
  };
}
