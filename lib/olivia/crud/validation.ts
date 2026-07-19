import { getOliviaCrudDefinition } from "@/lib/olivia/crud/registry";
import { OliviaCrudError, type OliviaCrudRequest, type OliviaCrudValueType } from "@/lib/olivia/crud/types";

function matchesType(value: unknown, type: OliviaCrudValueType) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === type;
}

function normalizeValue(value: unknown, type: OliviaCrudValueType) {
  if (type === "string" && typeof value !== "string" && value !== null && value !== undefined) return String(value);
  if (type === "number" && typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function validateOliviaCrudRequest(input: OliviaCrudRequest) {
  const definition = getOliviaCrudDefinition(input.domain);
  if (!definition) throw new OliviaCrudError("지원하지 않는 기능입니다.", "INVALID_DOMAIN", { domain: input.domain });
  if (input.operation !== "create" && input.operation !== "update") {
    throw new OliviaCrudError("지원하지 않는 작업입니다.", "INVALID_INPUT");
  }
  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
    throw new OliviaCrudError("생성·수정할 데이터가 필요합니다.", "INVALID_INPUT");
  }

  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [key, rawValue] of Object.entries(input.data)) {
    const rule = definition.fields[key];
    if (!rule || rawValue === undefined) continue;
    const value = normalizeValue(rawValue, rule.type);
    if (!matchesType(value, rule.type)) {
      errors.push(`${key} 형식이 올바르지 않습니다.`);
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (rule.maxLength && trimmed.length > rule.maxLength) errors.push(`${key} 값이 너무 깁니다.`);
      data[key] = trimmed;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) errors.push(`${key} 값이 숫자가 아닙니다.`);
      else if (rule.min !== undefined && value < rule.min) errors.push(`${key} 값은 ${rule.min} 이상이어야 합니다.`);
      else if (rule.max !== undefined && value > rule.max) errors.push(`${key} 값은 ${rule.max} 이하여야 합니다.`);
      else data[key] = value;
    } else {
      data[key] = value;
    }
    if (rule.enum && !rule.enum.includes(String(value))) errors.push(`${key} 값이 허용 범위에 없습니다.`);
  }

  if (input.operation === "create") {
    for (const [key, rule] of Object.entries(definition.fields)) {
      if (rule.requiredOnCreate && (data[key] === undefined || data[key] === "")) errors.push(`${key} 값은 필수입니다.`);
    }
  } else if (!input.target?.id && !input.target?.name && !input.target?.naturalKey) {
    throw new OliviaCrudError("수정할 대상의 ID 또는 이름이 필요합니다.", "INVALID_INPUT");
  }

  if (Object.keys(data).length === 0) errors.push("변경할 수 있는 필드가 없습니다.");
  if (errors.length) throw new OliviaCrudError(errors.join(" "), "INVALID_INPUT", { errors });

  const ownerOnlyChanged = (definition.ownerOnlyFields ?? []).filter((field) => field in data);
  return {
    definition,
    data,
    permission: ownerOnlyChanged.length ? "owner_only" as const : "review_required" as const,
    ownerOnlyChanged,
  };
}
