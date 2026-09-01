export interface StaffItem { role: string; count: number; detail: string }
export interface PatientItem { type: string; count: number; detail: string }
export interface LocationItem { floor: string; spaces: string; notes: string }

export interface ContiFormState {
  shootTitle: string;
  hospitalName: string;
  specialties: string[];
  doctors: string;
  viceDirectors: string;
  staffItems: StaffItem[];
  patientItems: PatientItem[];
  locationItems: LocationItem[];
  purpose: string;
  mainPeople: string;
  requiredScenes: string;
  notes: string;
}

export interface ContiRow {
  id?: string;
  category: string;
  duration: string;
  location: string;
  cameraAngle: string;
  keyword: string;
  description: string;
  personnel: string;
  notes: string;
  color?: string;
}

export interface ChecklistRow { number: number; category: string; item: string; notes: string; color?: string }
export interface ScheduleRow { time: string; duration?: string; activity: string; type: string; requirements: string; notes: string }
export interface ContiResult { conti: ContiRow[]; checklist: ChecklistRow[]; schedule: ScheduleRow[] }
export interface SavedConti { id: string; saved_at: string; hospital_name: string; title: string; result: ContiResult; specialties: string[]; client_id?: string | null; workflow_run_id?: string | null }
