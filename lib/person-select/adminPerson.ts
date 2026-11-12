export type PersonSelectAdminChoice = {
  id: string;
  image_id: string;
  category_key: string;
  retouch_keys: string[];
  memo: string;
  updated_at: string;
  person_select_images: {
    original_file_name: string;
    source_rel_path: string;
    thumb_url: string;
  } | null;
};

export type PersonSelectAdminRepresentativeImage = {
  category_key: string;
  original_file_name: string;
  source_rel_path: string;
  thumb_url: string;
};

export type PersonSelectAdminDeliveryItem = {
  id: string;
  person_id: string | null;
  group_label: string | null;
  display_name: string;
  current_version: number;
  status: "pending" | "revision_requested" | "revised" | "approved";
  customer_memo: string;
  preview_url: string;
  link_method: string | null;
  versions?: Array<{ version: number; uploaded_at: string; customer_memo_snapshot: string }>;
};

export type PersonSelectAdminOrderLine = {
  label: string;
  detail: string;
  unitPrice: number;
  qty: number;
  amount: number;
};

export type PersonSelectAdminPerson = {
  id: string;
  display_name: string;
  group_label: string | null;
  first_seen_at: string | null;
  submitted_at: string | null;
  status_label: string;
  latest_activity_at: string | null;
  image_counts: Record<string, number>;
  need_counts: Record<string, number>;
  choices: PersonSelectAdminChoice[];
  representative_image?: PersonSelectAdminRepresentativeImage | null;
  representative_images?: Record<string, PersonSelectAdminRepresentativeImage>;
  order?: { lines: PersonSelectAdminOrderLine[]; total: number };
  delivery_state?: string;
  delivery_approved_at?: string | null;
  delivery_downloaded_at?: string | null;
  delivery_files_purged_at?: string | null;
  delivery_count?: number;
  delivery_revision_count?: number;
  deliveries?: PersonSelectAdminDeliveryItem[];
  server_selected_count?: number;
  server_last_saved_at?: string | null;
  recent_save_failure_count?: number;
};
