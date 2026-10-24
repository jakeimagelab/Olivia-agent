import type { MedicalDepartment } from "./types";

export type PhotoDepartmentSource =
  | "manual"
  | "linked_client"
  | "linked_project"
  | "matched_client"
  | "folder_name"
  | "bridge_plan"
  | "saved_session";

export type PhotoDepartmentEvidence = {
  department: MedicalDepartment;
  rawValue: string;
  source: PhotoDepartmentSource;
};

export type ResolvedPhotoDepartment = {
  status: "resolved";
  department: MedicalDepartment;
  rawValue: string;
  source: PhotoDepartmentSource;
  evidence: PhotoDepartmentEvidence[];
};

export type PhotoDepartmentResolution =
  | ResolvedPhotoDepartment
  | { status: "unknown"; evidence: PhotoDepartmentEvidence[] }
  | { status: "conflict"; evidence: PhotoDepartmentEvidence[] };

export const PHOTO_DEPARTMENT_SOURCE_DISPLAY: Record<PhotoDepartmentSource, string> = {
  manual: "직접 선택",
  linked_client: "등록 고객 정보",
  linked_project: "연결 프로젝트 정보",
  matched_client: "폴더와 일치한 등록 고객",
  folder_name: "폴더명",
  bridge_plan: "Bridge 계획",
  saved_session: "저장된 작업",
};

const INTERNAL_DEPARTMENTS = new Set<MedicalDepartment>([
  "dermatology",
  "dentistry",
  "ophthalmology",
  "orthopedics_neurosurgery",
  "pediatrics",
  "korean_medicine",
  "plastic_surgery",
  "obgyn",
  "internal_medicine_checkup",
  "general",
]);

/** 폴더명·등록 고객의 진료과 표현을 Worker 내부 분류 설정으로만 바꾼다. */
export function departmentFromPhotoText(value: string): MedicalDepartment | null {
  const normalized = value.normalize("NFC").trim();
  if (INTERNAL_DEPARTMENTS.has(normalized as MedicalDepartment)) return normalized as MedicalDepartment;
  const compact = normalized.replace(/\s+/g, "");
  if (/구강|치과|교정|치주|보철/.test(compact)) return "dentistry";
  if (/피부과/.test(compact)) return "dermatology";
  if (/안과/.test(compact)) return "ophthalmology";
  if (/성형외과/.test(compact)) return "plastic_surgery";
  if (/정형외과|정형|신경외과|마취통증의학과|마취통증|통증의학과|통증클리닉|통증|재활의학과|재활/.test(compact)) {
    return "orthopedics_neurosurgery";
  }
  if (/소아/.test(compact)) return "pediatrics";
  if (/한의|한방/.test(compact)) return "korean_medicine";
  if (/산부인과/.test(compact)) return "obgyn";
  if (/내과|검진/.test(compact)) return "internal_medicine_checkup";
  if (/일반|브랜드|음식|제품|인테리어/.test(compact)) return "general";
  return null;
}

export function photoDepartmentEvidence(
  rawValue: string | null | undefined,
  source: PhotoDepartmentSource,
): PhotoDepartmentEvidence | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  const department = departmentFromPhotoText(value);
  return department ? { department, rawValue: value, source } : null;
}

export function resolvePhotoDepartmentEvidence(
  candidates: ReadonlyArray<PhotoDepartmentEvidence | null | undefined>,
): PhotoDepartmentResolution {
  const evidence = candidates.filter((candidate): candidate is PhotoDepartmentEvidence => Boolean(candidate));
  const manual = [...evidence].reverse().find((candidate) => candidate.source === "manual");
  if (manual) {
    return {
      status: "resolved",
      department: manual.department,
      rawValue: manual.rawValue,
      source: manual.source,
      evidence,
    };
  }
  if (evidence.length === 0) return { status: "unknown", evidence: [] };
  if (new Set(evidence.map((candidate) => candidate.department)).size > 1) {
    return { status: "conflict", evidence };
  }
  const primary = evidence[0];
  return {
    status: "resolved",
    department: primary.department,
    rawValue: primary.rawValue,
    source: primary.source,
    evidence,
  };
}

export function manualPhotoDepartmentResolution(department: MedicalDepartment): ResolvedPhotoDepartment {
  return {
    status: "resolved",
    department,
    rawValue: department,
    source: "manual",
    evidence: [{ department, rawValue: department, source: "manual" }],
  };
}

export function photoFolderClientName(folderName: string): string {
  const leafName = folderName.normalize("NFC").split(/[\\/]/).at(-1) ?? folderName;
  return leafName
    .replace(/^\d{2,8}[\s._-]*/, "")
    .trim();
}
