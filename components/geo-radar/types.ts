import type { AiTrustProviderStatus } from "@/lib/ai-trust/types";

export type GeoRadarClient = { id: string; hospital_name: string; specialty?: string | null; address?: string | null };
export type GeoRadarRegion = {
  id: string; name: string; region_type: "radius" | "districts" | "city" | "custom";
  center_lat: number | null; center_lng: number | null; radius_m: number | null;
  districts: string[]; region_terms: string[]; boundary_geojson_path?: string | null;
};
export type GeoRadarRun = {
  id: string; status: string; completed_requests: number; failed_requests: number; total_requests: number;
  actual_cost_usd?: number; created_at: string;
};
export type GeoRadarProject = {
  id: string; client_id?: string | null; project_name: string; client_hospital_name: string;
  region: string; region_id?: string | null; scope_label?: string | null; department: string;
  treatments?: string[]; status: string; created_at: string; runs?: GeoRadarRun[];
  region_config?: GeoRadarRegion | GeoRadarRegion[] | null;
};
export type GeoRadarJob = { id: string; job_type: string; status: string; error?: string | null; project_id?: string | null; attempts: number; created_at: string; updated_at: string };
export type GeoRadarOverview = {
  ok: boolean; setup_required?: boolean; apply_order?: string[]; error?: string;
  clients: GeoRadarClient[]; projects: GeoRadarProject[]; regions: GeoRadarRegion[];
  providers: AiTrustProviderStatus[]; review_count: number; jobs: GeoRadarJob[];
  costs: Array<{ project_id?: string | null; provider: string; amount_usd: number; created_at: string }>;
  pricing: Record<string, { input_per_million: number; output_per_million: number; web_search: number }>;
  budgets: { project_monthly_usd: number; global_monthly_usd: number; warning_ratio: number };
  map: { connected: boolean }; clinic_sources: { hira: boolean; kakao: boolean };
};
export type GeoRadarClinic = {
  id: string; canonical_name: string; address?: string | null; website?: string | null;
  latitude?: number | null; longitude?: number | null; mention_rate?: number; rank?: number;
  is_client?: boolean;
};

