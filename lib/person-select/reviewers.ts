import { randomBytes } from "node:crypto";
import { sharedReviewerTokenHash } from "./sharedPublic";

export function createPersonSelectReviewerToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: sharedReviewerTokenHash(token) };
}

export function parsePersonSelectReviewerInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "검토자 정보를 확인해 주세요." } as const;
  const body = value as Record<string, unknown>;
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const roleLabel = typeof body.roleLabel === "string" ? body.roleLabel.trim() : "";
  if (!displayName || displayName.length > 80) return { error: "검토자 이름은 1~80자로 적어 주세요." } as const;
  if (roleLabel.length > 80) return { error: "역할은 80자까지 적을 수 있습니다." } as const;
  return { displayName, roleLabel } as const;
}

export function normalizeNasDownloadUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return { value: null } as const;
  if (typeof value !== "string" || value.length > 2_000) return { error: "NAS 공유 링크는 2000자까지 입력할 수 있습니다." } as const;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return { error: "NAS 공유 링크는 https 주소만 사용할 수 있습니다." } as const;
    url.username = "";
    url.password = "";
    return { value: url.toString() } as const;
  } catch {
    return { error: "올바른 NAS 공유 링크를 입력해 주세요." } as const;
  }
}
