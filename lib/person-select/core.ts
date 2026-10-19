import { randomInt, timingSafeEqual } from "node:crypto";
import type { PersonSelectCategory } from "./types";

export function normalizeNfc(value: string) {
  return value.normalize("NFC");
}

export function normalizeLoginName(value: string) {
  return normalizeNfc(value).replace(/\s+/g, "").trim();
}

export function constantTimePinEqual(left: string, right: string) {
  const a = Buffer.from(String(left), "utf8");
  const b = Buffer.from(String(right), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isLoginRateLimited(failedAttempts: number) {
  return failedAttempts >= 10;
}

export function canAccessImageRecord(input: {
  personId: string;
  groupLabel: string | null;
  categoryKey: string;
  imageOwnerPersonId: string | null;
  imageOwnerGroup: string | null;
}) {
  if (input.categoryKey === "homeroom") return Boolean(input.groupLabel && input.imageOwnerGroup === input.groupLabel);
  return input.imageOwnerPersonId === input.personId;
}

export function createUniquePin(existing: Iterable<string>) {
  const used = new Set(existing);
  if (used.size >= 10_000) throw new Error("발급할 수 있는 비밀번호가 없습니다.");
  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!used.has(pin)) return pin;
  }
  throw new Error("중복되지 않는 비밀번호를 만들지 못했습니다.");
}

export function parsePersonFolderName(folderName: string, prefix: string) {
  const name = normalizeNfc(folderName);
  const normalizedPrefix = normalizeNfc(prefix).replace(/_+$/, "");
  const value = name.startsWith(`${normalizedPrefix}_`) ? name.slice(normalizedPrefix.length + 1) : "";
  return value.trim() || null;
}

export function parseGroupFolderName(folderName: string, prefix: string) {
  const name = normalizeNfc(folderName);
  const normalizedPrefix = normalizeNfc(prefix).replace(/_+$/, "");
  if (!name.startsWith(`${normalizedPrefix}_`)) return null;
  return name.slice(normalizedPrefix.length + 1).match(/(\d+반)/)?.[1] ?? null;
}

export function eventIsLocked(event: { status: string; deadline_at: string }, now = new Date()) {
  return event.status === "closed" || now.getTime() > new Date(event.deadline_at).getTime();
}

export function requiredCategoryKeys(input: {
  categories: PersonSelectCategory[];
  groupLabel: string | null;
  imageCounts: Record<string, number>;
}) {
  return input.categories
    .filter((category) => category.pick > 0)
    .filter((category) => category.key !== "homeroom" || Boolean(input.groupLabel && (input.imageCounts[category.key] ?? 0) > 0))
    .map((category) => category.key);
}

export function selectionStatus(input: {
  firstSeenAt: string | null;
  submittedAt: string | null;
  choiceCount: number;
  latestChoiceAt: string | null;
}) {
  if (!input.firstSeenAt) return "미접속";
  if (!input.submittedAt) return input.choiceCount > 0 ? "저장 중" : "미접속";
  if (input.latestChoiceAt && new Date(input.latestChoiceAt) > new Date(input.submittedAt)) return "제출 후 수정됨";
  return "제출 완료";
}

export function validateChoiceInput(input: {
  retouchKeys: unknown;
  memo: unknown;
  allowedKeys: string[];
  memoMax: number;
}) {
  if (!Array.isArray(input.retouchKeys) || input.retouchKeys.some((key) => typeof key !== "string" || !input.allowedKeys.includes(key))) {
    return "행사에 없는 보정 요청입니다.";
  }
  if (typeof input.memo !== "string" || input.memo.length > input.memoMax) {
    return `메모는 ${input.memoMax}자까지 적을 수 있습니다.`;
  }
  return null;
}
