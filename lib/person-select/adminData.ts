import type {
  CustomerBridgeDraft,
  CustomerBridgeImage,
} from "@/lib/select-gallery/customerBridgeTypes";
import type {
  PersonSelectAccessMode,
  PersonSelectCustomerViewMode,
  PersonSelectOffer,
  PersonSelectProjectType,
} from "@/lib/person-select/types";
import type {
  PersonSelectAdminDeliveryItem,
  PersonSelectAdminPerson,
} from "@/lib/person-select/adminPerson";

export type PersonSelectAdminCategory = { key: string; label: string; pick: number };

export type PersonSelectAdminEvent = {
  id: string;
  title: string;
  slug: string;
  deadline_at: string;
  status: string;
  categories: PersonSelectAdminCategory[];
  retouch_options: { key: string; label: string }[];
  source_layout?: "school" | "person-folders" | "project";
  source_relative_path?: string | null;
  raw_match_result?: Record<string, unknown> | null;
  raw_matched_at?: string | null;
  offer_notice?: string;
  extra_price?: number;
  extra_max?: number;
  offers?: PersonSelectOffer[];
  project_type?: PersonSelectProjectType;
  access_mode?: PersonSelectAccessMode;
  customer_view_mode?: PersonSelectCustomerViewMode;
  customer_stage?: "select" | "delivery";
  delivery_retention_days?: number;
  delivery_state?: string;
  delivery_approved_at?: string | null;
  delivery_downloaded_at?: string | null;
  delivery_files_purged_at?: string | null;
  shared_token?: string | null;
  shared_link_active?: boolean;
  shared_token_expires_at?: string | null;
  nas_download_url?: string | null;
  customer_ai_results_visible?: boolean;
};

export type PersonSelectSharedSelectionItem = {
  image_id: string;
  customer_rating: number | null;
  customer_color_label?: number | null;
  memo: string;
  image: {
    original_file_name: string;
    source_rel_path: string;
    thumb_url: string;
  } | null;
};

export type PersonSelectSharedSelection = {
  id: string;
  submitted_at: string;
  customer_memo: string;
  items: PersonSelectSharedSelectionItem[];
};

export type PersonSelectSharedReviewer = {
  id: string;
  display_name: string;
  role_label: string | null;
  active: boolean;
  is_legacy: boolean;
  last_seen_at: string | null;
  can_view_ai_results?: boolean;
  can_download_jpg?: boolean;
  can_download_raw?: boolean;
  can_finalize?: boolean;
  draft: (CustomerBridgeDraft & {
    selected_count: number;
    updated_at: string;
    items?: PersonSelectSharedSelectionItem[];
  }) | null;
  selection: PersonSelectSharedSelection | null;
  server_selected_count?: number;
  server_last_saved_at?: string | null;
  recent_save_failure_count?: number;
};

export type PersonSelectSharedAdminData = {
  image_count: number;
  images: CustomerBridgeImage[];
  selection: PersonSelectSharedSelection | null;
  reviewers: PersonSelectSharedReviewer[];
  deliveries?: PersonSelectAdminDeliveryItem[];
};

export type PersonSelectSyncAdminData = {
  recent_failure_count: number;
  recent_failures: Array<{
    actor_type: "person" | "reviewer";
    actor_id: string;
    at: string;
    error: string;
  }>;
};

export type PersonSelectAdminGroup = { label: string; image_count: number };

export type PersonSelectAdminData = {
  event: PersonSelectAdminEvent;
  people: PersonSelectAdminPerson[];
  groups: PersonSelectAdminGroup[];
  shared?: PersonSelectSharedAdminData | null;
  sync?: PersonSelectSyncAdminData;
};
