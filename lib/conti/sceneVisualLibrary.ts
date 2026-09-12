import type { ContiSceneVisual } from "@/lib/conti/studioState";

export interface SceneVisualQuery {
  specialty?: string | null;
  name?: string | null;
  keyword?: string | null;
  procedures?: string[] | null;
}
const VISUAL_RULES: Array<{ key: string; pattern: RegExp; imageUrl: string }> = [
  { key: "doctor_profile", pattern: /원장|의사|의료진.*(프로필|인물)|프로필/, imageUrl: "/assets/conti-scenes/doctor-profile.svg" },
  { key: "consultation", pattern: /상담|문진|진료/, imageUrl: "/assets/conti-scenes/consultation.svg" },
  { key: "staff", pattern: /직원|실장|코디|데스크/, imageUrl: "/assets/conti-scenes/staff.svg" },
  { key: "ultrasound", pattern: /초음파/, imageUrl: "/assets/conti-scenes/ultrasound.svg" },
  { key: "treatment", pattern: /주사|시술|치료|수술|레이저|보톡스|필러/, imageUrl: "/assets/conti-scenes/treatment.svg" },
  { key: "rehabilitation", pattern: /도수|재활|물리|운동/, imageUrl: "/assets/conti-scenes/rehabilitation.svg" },
  { key: "reception", pattern: /접수|인포|안내/, imageUrl: "/assets/conti-scenes/reception.svg" },
  { key: "interior", pattern: /외관|내부|인테리어|공간|시설/, imageUrl: "/assets/conti-scenes/interior.svg" },
  { key: "harmony", pattern: /하모니|단체/, imageUrl: "/assets/conti-scenes/harmony.svg" },
];

export function resolveSceneVisual(query: SceneVisualQuery): ContiSceneVisual {
  const haystack = [query.specialty, query.name, query.keyword, ...(query.procedures ?? [])].filter(Boolean).join(" ");
  const rule = VISUAL_RULES.find((candidate) => candidate.pattern.test(haystack));
  if (!rule) return { source: "library", sceneKey: "neutral", imageUrl: "/assets/conti-scenes/neutral.svg" };
  return { source: "library", sceneKey: rule.key, imageUrl: rule.imageUrl };
}
