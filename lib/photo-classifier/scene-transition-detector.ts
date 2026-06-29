import type { MedicalDepartment } from "./types";

type AISceneFeatures = {
  sceneType: string;
  patientPosture?: string | null;
  hasHandpiece?: boolean | null;
  hasTreatmentDevice?: boolean | null;
  hasTreatmentBed?: boolean | null;
  hasConsultationDesk?: boolean | null;
};

// Strong directional scene-type transitions per department
const DEPT_STRONG: Partial<Record<MedicalDepartment, Set<string>>> = {
  dermatology: new Set([
    "manager_consultation→doctor_consultation",
    "doctor_consultation→device_treatment",
    "doctor_consultation→laser_treatment",
    "doctor_consultation→injection_treatment",
    "skin_care→device_treatment",
    "skin_care→injection_treatment",
    "device_treatment→injection_treatment",
    "laser_treatment→injection_treatment",
  ]),
  dentistry: new Set([
    "info_desk→manager_consultation",
    "manager_consultation→doctor_consultation",
    "doctor_consultation→dental_treatment",
    "dental_treatment→implant_surgery",
    "harmony→dental_treatment",
    "harmony→implant_surgery",
  ]),
  plastic_surgery: new Set([
    "manager_consultation→doctor_consultation",
    "doctor_consultation→doctor_treatment",
    "doctor_consultation→injection_treatment",
    "doctor_consultation→surgery_scene",
    "doctor_treatment→surgery_scene",
    "injection_treatment→surgery_scene",
    "lifting_laser_treatment→surgery_scene",
  ]),
  orthopedics_neurosurgery: new Set([
    "doctor_consultation→xray",
    "doctor_consultation→c_arm_procedure",
    "doctor_consultation→ultrasound_procedure",
    "doctor_consultation→physical_therapy",
    "doctor_consultation→shockwave_manual_therapy",
    "physical_therapy→shockwave_manual_therapy",
    "physical_therapy→c_arm_procedure",
  ]),
};

// Universal transitions applicable to any department
const UNIVERSAL_STRONG = new Set([
  "profile→doctor_consultation",
  "profile→device_treatment",
  "profile→injection_treatment",
  "profile→laser_treatment",
  "profile→dental_treatment",
  "profile→surgery_scene",
  "profile→doctor_treatment",
  "profile→physical_therapy",
  "interior→doctor_consultation",
  "interior→device_treatment",
  "interior→injection_treatment",
  "reception→doctor_consultation",
  "reception→device_treatment",
]);

export type TransitionResult = {
  isStrong: boolean;
  transitionStrength: number;  // 0–1
  reasons: string[];
};

export function detectStrongTransition(
  prev: AISceneFeatures,
  next: AISceneFeatures,
  department: MedicalDepartment,
): TransitionResult {
  const reasons: string[] = [];
  let strength = 0;

  const key = `${prev.sceneType}→${next.sceneType}`;

  // Department-specific table
  if (DEPT_STRONG[department]?.has(key)) {
    reasons.push(`${prev.sceneType} → ${next.sceneType} 장면 전환`);
    strength = Math.max(strength, 0.70);
  }

  // Universal table
  if (UNIVERSAL_STRONG.has(key)) {
    reasons.push(`${prev.sceneType} → ${next.sceneType} 전환`);
    strength = Math.max(strength, 0.60);
  }

  // Feature-based checks (additive on top of type-based)
  if (prev.patientPosture === "seated" && next.patientPosture === "lying_down") {
    reasons.push("환자 자세 변화 (앉음 → 누움)");
    strength += 0.30;
  }
  if (prev.patientPosture === "lying_down" && next.patientPosture === "seated") {
    reasons.push("환자 자세 변화 (누움 → 앉음)");
    strength += 0.20;
  }
  if (prev.patientPosture === "standing" && next.patientPosture === "lying_down") {
    reasons.push("환자 자세 변화 (서있음 → 누움)");
    strength += 0.25;
  }
  if (prev.hasHandpiece === false && next.hasHandpiece === true) {
    reasons.push("핸드피스 등장");
    strength += 0.25;
  }
  if (prev.hasTreatmentDevice === false && next.hasTreatmentDevice === true) {
    reasons.push("치료 장비 등장");
    strength += 0.20;
  }
  if (prev.hasConsultationDesk === true && next.hasTreatmentBed === true &&
      prev.hasTreatmentBed !== true && next.hasConsultationDesk !== true) {
    reasons.push("상담 책상 → 시술 베드");
    strength += 0.25;
  }
  if (prev.hasTreatmentBed === true && next.hasConsultationDesk === true &&
      prev.hasConsultationDesk !== true && next.hasTreatmentBed !== true) {
    reasons.push("시술 베드 → 상담 책상");
    strength += 0.15;
  }

  const clamped = Math.min(strength, 1.0);
  return {
    isStrong: clamped >= 0.50 || (reasons.length >= 2 && clamped >= 0.35),
    transitionStrength: clamped,
    reasons,
  };
}
