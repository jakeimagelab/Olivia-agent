import type { PcrmPublicationStatus } from "./types";

export const PCRM_INQUIRY_CATEGORIES = [
  "schedule", "quote", "contract", "preparation", "conti",
  "gallery", "revision", "delivery", "other",
] as const;

export const PCRM_PREPARATION_INPUT_TYPES = ["text", "textarea", "boolean", "date", "list", "file"] as const;

export const DEFAULT_PREPARATION_ITEMS = [
  { item_key: "shoot_date", title: "촬영일 확인", input_type: "date", is_required: true },
  { item_key: "location_parking", title: "촬영 장소와 주차", input_type: "textarea", is_required: true },
  { item_key: "medical_staff", title: "의료진 명단", input_type: "textarea", is_required: true },
  { item_key: "staff", title: "직원 명단", input_type: "textarea", is_required: false },
  { item_key: "spaces", title: "촬영 공간과 동선", input_type: "textarea", is_required: true },
  { item_key: "outfit", title: "의상·가운·스크럽", input_type: "textarea", is_required: false },
  { item_key: "patient_model", title: "환자 모델 및 촬영 허가", input_type: "textarea", is_required: false },
  { item_key: "reference", title: "참고 이미지와 특이사항", input_type: "textarea", is_required: false },
] as const;

export function canTransitionPublication(
  current: PcrmPublicationStatus,
  action: "view" | "approve" | "request_revision",
) {
  if (action === "view") return current === "published";
  if (action === "approve") return current === "published" || current === "viewed";
  return ["published", "viewed", "approved"].includes(current);
}

export function hasPreparationValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.values(record).some((entry) => hasPreparationValue(entry));
  }
  return false;
}

export function getPcrmSceneKey(scene: Record<string, unknown>, index: number) {
  const explicit = scene.id ?? scene.sceneId ?? scene.scene_id ?? scene.key;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().slice(0, 120);
  const seed = JSON.stringify([
    scene.category ?? "",
    scene.title ?? "",
    scene.description ?? "",
    scene.location ?? "",
  ]);
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
  return `scene-${index + 1}-${(hash >>> 0).toString(36)}`;
}

export function validateShortText(value: unknown, label: string, max: number, required = true) {
  const text = String(value ?? "").trim();
  if (required && !text) return { ok: false as const, error: `${label}을(를) 입력해 주세요.` };
  if (text.length > max) return { ok: false as const, error: `${label}은(는) ${max.toLocaleString()}자까지 입력할 수 있습니다.` };
  return { ok: true as const, value: text };
}
