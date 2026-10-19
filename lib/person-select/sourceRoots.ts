import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

export const PERSON_SELECT_ROOTS_ENV = "OLIVIA_PERSON_SELECT_ROOTS";
export const DEFAULT_PERSON_SELECT_ROOTS = [
  "/Volumes/Workstation(M.2SSD)",
  "/Users/jakemacstudio/UGnasync",
] as const;

export type PersonSelectRoot = {
  id: `root-${number}`;
  path: string;
  label: string;
};

function normalizePathForComparison(value: string) {
  return value.split(path.sep).map((segment) => segment.normalize("NFC")).join(path.sep);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(normalizePathForComparison(root), normalizePathForComparison(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function friendlyRootLabel(root: string): string {
  if (root === "/Volumes/Workstation(M.2SSD)") return "Workstation(M.2SSD)";
  if (root === "/Users/jakemacstudio/UGnasync") return "UGnasync";
  return path.basename(root) || root;
}

/** JSON 배열 또는 줄바꿈 목록만 허용한다. 콜론 분리는 경로 문자와 충돌하므로 사용하지 않는다. */
export function parsePersonSelectRoots(raw = process.env[PERSON_SELECT_ROOTS_ENV]): string[] {
  const value = raw?.trim();
  if (!value) return [...DEFAULT_PERSON_SELECT_ROOTS];
  let roots: unknown = null;
  if (value.startsWith("[")) {
    try { roots = JSON.parse(value); } catch { throw new Error(`${PERSON_SELECT_ROOTS_ENV}는 JSON 배열 또는 줄바꿈 목록이어야 합니다.`); }
  } else {
    roots = value.split(/\r?\n/);
  }
  if (!Array.isArray(roots)) throw new Error(`${PERSON_SELECT_ROOTS_ENV}는 JSON 배열 또는 줄바꿈 목록이어야 합니다.`);
  const output = roots
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!output.length || output.some((entry) => !path.isAbsolute(entry))) {
    throw new Error(`${PERSON_SELECT_ROOTS_ENV}에는 절대 경로만 넣어야 합니다.`);
  }
  return [...new Set(output)];
}

export function getPersonSelectRoots(raw = process.env[PERSON_SELECT_ROOTS_ENV]): PersonSelectRoot[] {
  return parsePersonSelectRoots(raw).map((root, index) => ({
    id: `root-${index}` as `root-${number}`,
    path: root,
    label: friendlyRootLabel(root),
  }));
}

function containsTraversal(value: string) {
  return value.includes("\0") || value.split(/[\\/]/).some((segment) => segment === "..");
}

function sourceError(error: unknown): Error {
  const code = error && typeof error === "object" && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
  if (code === "EACCES" || code === "EPERM") return new Error("이 폴더를 읽을 권한이 없어요.");
  if (code === "ENOENT" || code === "ENOTDIR") return new Error("드라이브가 연결되어 있지 않아요.");
  return error instanceof Error ? error : new Error("이 폴더를 읽을 수 없어요.");
}

async function canonicalDirectory(input: string): Promise<string> {
  try {
    const info = await lstat(input);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("조회 대상이 안전한 폴더가 아닙니다.");
    return await realpath(input);
  } catch (error) {
    throw sourceError(error);
  }
}

/**
 * UI 선택값(root-N/하위경로), 기존 상대경로, 절대 경로를 모두 전용 허용 루트 안으로만 해석한다.
 * raw input의 ..와 symlink 탈출은 realpath 전후 모두 차단한다.
 */
export async function resolvePersonSelectSourcePath(input: string, raw = process.env[PERSON_SELECT_ROOTS_ENV]) {
  const requested = input.trim();
  if (!requested) throw new Error("학교전달 폴더를 선택해 주세요.");
  if (containsTraversal(requested)) throw new Error("허용 루트 밖의 경로는 사용할 수 없습니다.");
  const roots = getPersonSelectRoots(raw);
  const canonicalRoots = await Promise.all(roots.map(async (root) => ({ ...root, canonicalPath: await canonicalDirectory(root.path) })));

  let candidate: string;
  if (path.isAbsolute(requested)) {
    candidate = path.resolve(requested);
  } else {
    const [first, ...rest] = requested.replace(/\\/g, "/").split("/").filter(Boolean);
    const matchedRoot = canonicalRoots.find((root) => root.id === first);
    candidate = matchedRoot ? path.resolve(matchedRoot.canonicalPath, ...rest) : path.resolve(canonicalRoots[0].canonicalPath, first, ...rest);
  }

  const canonicalPath = await canonicalDirectory(candidate);
  const matched = canonicalRoots.find((root) => isInside(root.canonicalPath, canonicalPath));
  if (!matched) throw new Error("허용 루트 밖의 경로는 사용할 수 없습니다.");
  return { root: matched, canonicalPath, relativePath: path.relative(matched.canonicalPath, canonicalPath).split(path.sep).join("/") };
}

export function toPersonSelectVirtualPath(root: PersonSelectRoot, relativePath = "") {
  return [root.id, ...relativePath.split("/").filter(Boolean)].join("/");
}
