import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { RunnerRoots } from "@/lib/photo-classifier/node/types";
import { getStorageRoots } from "@/lib/photo-classifier/node/storageConfig";

export function normalizePhotoProjectPath(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.includes("\\") || value.startsWith("/") || path.isAbsolute(value)) {
    throw new Error("프로젝트 경로는 Storage Root 기준 안전한 상대경로여야 합니다.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("프로젝트 경로에 허용되지 않는 항목이 있습니다.");
  }
  return segments.join("/");
}

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function requireSafeDirectory(target: string, label: string): Promise<string> {
  const metadata = await lstat(target).catch(() => null);
  if (!metadata) throw new Error(`${label}을 찾을 수 없습니다.`);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`${label}이 안전한 폴더가 아닙니다.`);
  const canonical = await realpath(target);
  if (!(await stat(canonical)).isDirectory()) throw new Error(`${label}이 폴더가 아닙니다.`);
  return canonical;
}

export async function resolvePhotoProjectDirectories(input: {
  projectRelativePath: string;
  roots?: RunnerRoots;
  createWorkProject?: boolean;
}): Promise<{ roots: RunnerRoots; relativePath: string; sourceRoot: string; workRoot: string; sourceProject: string; workProject: string }> {
  const roots = input.roots ?? getStorageRoots();
  const relativePath = normalizePhotoProjectPath(input.projectRelativePath);
  const sourceRoot = await requireSafeDirectory(roots.sourceRoot, "SOURCE_ROOT");
  const workRoot = await requireSafeDirectory(roots.workRoot, "WORK_ROOT");
  if (sourceRoot === workRoot || isInside(sourceRoot, workRoot) || isInside(workRoot, sourceRoot)) {
    throw new Error("SOURCE_ROOT과 WORK_ROOT은 서로 겹칠 수 없습니다.");
  }
  const sourceCandidate = path.resolve(sourceRoot, ...relativePath.split("/"));
  const workCandidate = path.resolve(workRoot, ...relativePath.split("/"));
  if (!isInside(sourceRoot, sourceCandidate) || !isInside(workRoot, workCandidate)) {
    throw new Error("프로젝트 경로가 Storage Root 밖을 가리킵니다.");
  }
  const sourceProject = await requireSafeDirectory(sourceCandidate, "SSD1 프로젝트");
  if (input.createWorkProject) await ensureSafeDirectory(workRoot, workCandidate);
  const workProject = await requireSafeDirectory(workCandidate, "SSD2 프로젝트");
  if (!isInside(sourceRoot, sourceProject) || !isInside(workRoot, workProject)) {
    throw new Error("프로젝트의 실제 경로가 Storage Root 밖을 가리킵니다.");
  }
  return { roots, relativePath, sourceRoot, workRoot, sourceProject, workProject };
}

export async function resolvePhotoWorkProjectDirectory(input: {
  projectRelativePath: string;
  roots?: RunnerRoots;
}): Promise<{ roots: RunnerRoots; relativePath: string; workRoot: string; workProject: string }> {
  const roots = input.roots ?? getStorageRoots();
  const relativePath = normalizePhotoProjectPath(input.projectRelativePath);
  const workRoot = await requireSafeDirectory(roots.workRoot, "WORK_ROOT");
  const workCandidate = path.resolve(workRoot, ...relativePath.split("/"));
  if (!isInside(workRoot, workCandidate)) throw new Error("프로젝트 경로가 WORK_ROOT 밖을 가리킵니다.");
  const workProject = await requireSafeDirectory(workCandidate, "SSD2 프로젝트");
  if (!isInside(workRoot, workProject)) throw new Error("프로젝트의 실제 경로가 WORK_ROOT 밖을 가리킵니다.");
  return { roots, relativePath, workRoot, workProject };
}

export async function ensureSafeDirectory(root: string, target: string): Promise<string> {
  if (!isInside(root, target)) throw new Error("생성할 폴더가 허용된 Root 밖을 가리킵니다.");
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const existing = await lstat(cursor).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error(`안전하지 않은 폴더 경로입니다: ${segment}`);
    } else {
      await mkdir(cursor);
    }
    const canonical = await realpath(cursor);
    if (canonical !== root && !isInside(root, canonical)) throw new Error("생성된 폴더가 허용된 Root 밖을 가리킵니다.");
  }
  return realpath(target);
}

export function extension(name: string): string {
  return name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
}

export function posixRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}
