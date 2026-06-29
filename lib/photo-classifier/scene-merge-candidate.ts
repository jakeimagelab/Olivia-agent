import type { MedicalDepartment } from "./types";
import type { SceneMergeCandidate } from "./scene-merge-types";
import { detectStrongTransition } from "./scene-transition-detector";

// Scene types that rarely appear in multi-scene clusters — skip merge for these
const SKIP_MERGE_TYPES = new Set([
  "profile", "interior", "reception", "etc", "info_desk",
  "harmony", "xray",
]);

type SceneSnapshot = {
  folderName: string;
  editedName: string;
  sceneType: string;
  patientPosture?: string | null;
  hasHandpiece?: boolean | null;
  hasTreatmentDevice?: boolean | null;
  hasTreatmentBed?: boolean | null;
  hasConsultationDesk?: boolean | null;
};

function computeMergeScore(
  a: SceneSnapshot,
  b: SceneSnapshot,
  transitionStrength: number,
): { score: number; matched: string[]; blocked: string[] } {
  const matched: string[] = [];
  const blocked: string[] = [];
  let pts = 0;

  // Scene type match (most important)
  if (a.sceneType === b.sceneType) {
    matched.push("같은 장면 타입");
    pts += 35;
  } else {
    blocked.push(`장면 타입 불일치 (${a.sceneType} ≠ ${b.sceneType})`);
    pts -= 25;
  }

  // Patient posture
  if (a.patientPosture != null && b.patientPosture != null) {
    if (a.patientPosture === b.patientPosture && a.patientPosture !== "unclear") {
      matched.push(`같은 환자 자세 (${a.patientPosture})`);
      pts += 20;
    } else if (
      a.patientPosture !== "unclear" && b.patientPosture !== "unclear" &&
      a.patientPosture !== b.patientPosture
    ) {
      blocked.push(`자세 변화 (${a.patientPosture} → ${b.patientPosture})`);
      pts -= 20;
    }
  }

  // Treatment device
  if (a.hasTreatmentDevice != null && b.hasTreatmentDevice != null) {
    if (a.hasTreatmentDevice === b.hasTreatmentDevice) {
      if (a.hasTreatmentDevice) matched.push("동일 치료 장비 사용");
      pts += 10;
    } else {
      blocked.push("장비 유무 변화");
      pts -= 10;
    }
  }

  // Handpiece
  if (a.hasHandpiece != null && b.hasHandpiece != null) {
    if (a.hasHandpiece === b.hasHandpiece) {
      if (a.hasHandpiece) matched.push("동일 핸드피스 사용");
      pts += 10;
    } else {
      blocked.push("핸드피스 유무 변화");
      pts -= 10;
    }
  }

  // Treatment bed
  if (a.hasTreatmentBed != null && b.hasTreatmentBed != null) {
    if (a.hasTreatmentBed === b.hasTreatmentBed) {
      if (a.hasTreatmentBed) matched.push("같은 시술 베드");
      pts += 8;
    } else {
      blocked.push("베드 유무 변화");
      pts -= 5;
    }
  }

  // Consultation desk
  if (a.hasConsultationDesk != null && b.hasConsultationDesk != null) {
    if (a.hasConsultationDesk === b.hasConsultationDesk) {
      if (a.hasConsultationDesk) matched.push("같은 상담 공간");
      pts += 7;
    } else {
      blocked.push("공간 변화 (상담↔시술)");
      pts -= 5;
    }
  }

  // Penalize for transition strength
  pts -= Math.round(transitionStrength * 30);

  // Normalize: base is 0 pts → 0.3, max ~90 pts → 1.0
  const score = Math.max(0, Math.min(1, (pts + 30) / 100));
  return { score, matched, blocked };
}

export function buildMergeCandidates(
  scenes: SceneSnapshot[],
  department: MedicalDepartment,
): SceneMergeCandidate[] {
  const candidates: SceneMergeCandidate[] = [];

  for (let i = 0; i < scenes.length - 1; i++) {
    const a = scenes[i];
    const b = scenes[i + 1];

    // Need AI data to compare
    if (!a.sceneType || !b.sceneType) continue;

    // Skip singleton scene types
    if (SKIP_MERGE_TYPES.has(a.sceneType) || SKIP_MERGE_TYPES.has(b.sceneType)) continue;

    const transition = detectStrongTransition(
      {
        sceneType: a.sceneType,
        patientPosture: a.patientPosture,
        hasHandpiece: a.hasHandpiece,
        hasTreatmentDevice: a.hasTreatmentDevice,
        hasTreatmentBed: a.hasTreatmentBed,
        hasConsultationDesk: a.hasConsultationDesk,
      },
      {
        sceneType: b.sceneType,
        patientPosture: b.patientPosture,
        hasHandpiece: b.hasHandpiece,
        hasTreatmentDevice: b.hasTreatmentDevice,
        hasTreatmentBed: b.hasTreatmentBed,
        hasConsultationDesk: b.hasConsultationDesk,
      },
      department,
    );

    const { score, matched, blocked } = computeMergeScore(a, b, transition.transitionStrength);

    // Determine recommendation
    let recommendedAction: "merge" | "keep_split" | null;
    if (transition.isStrong) {
      recommendedAction = "keep_split";
    } else if (score >= 0.62) {
      recommendedAction = "merge";
    } else {
      continue; // Not strong enough in either direction — skip
    }

    // Build human-readable reason
    let reason: string;
    if (recommendedAction === "merge") {
      const signals = matched.slice(0, 3).join(", ");
      reason = `두 씬 모두 ${signals}으로 보입니다. 촬영 시간차가 있지만 조명·구도 조정으로 인한 지연일 가능성이 높습니다.`;
    } else {
      const causes = transition.reasons.slice(0, 3).join(". ");
      reason = `${causes}. 실제 장면 전환이 감지되어 분리 유지를 추천합니다.`;
    }

    candidates.push({
      id: `${recommendedAction}_${a.folderName}_${b.folderName}`,
      fromFolderName: a.folderName,
      toFolderName: b.folderName,
      fromDisplayName: a.editedName,
      toDisplayName: b.editedName,
      fromSceneType: a.sceneType,
      toSceneType: b.sceneType,
      mergeScore: score,
      transitionStrength: transition.transitionStrength,
      recommendedAction,
      reason,
      matchedSignals: matched,
      blockedSignals: [...blocked, ...transition.reasons],
    });
  }

  return candidates;
}
