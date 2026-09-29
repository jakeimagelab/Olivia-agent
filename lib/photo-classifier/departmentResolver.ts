import type { MedicalDepartment } from "./types";

/** 폴더명·등록 고객의 진료과 표현을 Worker 내부 분류 설정으로만 바꾼다. */
export function departmentFromPhotoText(value: string): MedicalDepartment | null {
  if (/구강|치과|교정|치주|보철/.test(value)) return "dentistry";
  if (/피부과/.test(value)) return "dermatology";
  if (/안과/.test(value)) return "ophthalmology";
  if (/정형외과|신경외과|통증/.test(value)) return "orthopedics_neurosurgery";
  if (/소아/.test(value)) return "pediatrics";
  if (/한의|한방/.test(value)) return "korean_medicine";
  if (/성형외과/.test(value)) return "plastic_surgery";
  if (/산부인과/.test(value)) return "obgyn";
  if (/내과|검진/.test(value)) return "internal_medicine_checkup";
  if (/일반|브랜드|음식|제품|인테리어/.test(value)) return "general";
  return null;
}
