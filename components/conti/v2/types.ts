import type { ContiStudioState } from "@/lib/conti/studioState";

export interface ContiRunRow {
  id: string;
  hospital_id?: string | null;
  hospital_name?: string | null;
  workflow_run_id?: string | null;
  specialty?: string | null;
  doctor_count?: number | null;
  staff_flags?: Record<string, unknown>;
  harmony?: boolean;
  checked?: Record<string, string[]>;
  custom_items?: string[];
  studio_state?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface ContiGroupRow {
  id: string;
  run_id: string;
  name: string;
  color?: string | null;
  sort: number;
}

export interface ContiSceneRow {
  id: string;
  run_id: string;
  group_id: string | null;
  sort: number;
  name: string;
  space_text: string;
  minutes: number | null;
  keyword: string;
  description: string;
  procedures: string[];
  people_text: string;
  patient_role_text: string;
  preparation_text: string;
  note: string;
  template_id: string | null;
  field_sources: Record<string, string>;
  completed: boolean;
}

export interface ContiStudioDocument {
  run: ContiRunRow;
  groups: ContiGroupRow[];
  scenes: ContiSceneRow[];
  studioState: ContiStudioState;
}

export type ContiSaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

export type ContiEditableSceneField =
  | "name"
  | "space_text"
  | "minutes"
  | "keyword"
  | "description"
  | "people_text"
  | "patient_role_text"
  | "preparation_text"
  | "note";
