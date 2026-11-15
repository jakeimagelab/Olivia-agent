import path from "node:path";
import { mkdir, readdir, writeFile } from "node:fs/promises";

import { toPersonSelectVirtualPath, type PersonSelectRoot } from "@/lib/person-select/sourceRoots";
import type { ColorMatchManifest } from "@/lib/photo-edit/manifest";

export type JpegCandidate = { absolutePath: string; relativePath: string; fileName: string };

export function safeColorMatchPathParts(relativePath: string): string[] {
  const normalized = relativePath.replace(/\\/gu, "/").normalize("NFC");
  const parts = normalized.split("/");
  if (!normalized || path.isAbsolute(normalized) || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("색 맞춤 파일 경로가 올바르지 않습니다.");
  }
  return parts;
}

export async function scanColorMatchJpegs(root: string): Promise<JpegCandidate[]> {
  const files: JpegCandidate[] = [];
  async function visit(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(absolutePath); continue; }
      if (!entry.isFile() || !/\.jpe?g$/iu.test(entry.name)) continue;
      files.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath).split(path.sep).join("/").normalize("NFC"),
        fileName: entry.name.normalize("NFC"),
      });
    }
  }
  await visit(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "ko", { numeric: true }));
}

export async function reserveColorMatchOutputFolder(sourcePath: string): Promise<string> {
  const parent = path.dirname(sourcePath);
  const base = `${path.basename(sourcePath)}_색맞춤`;
  const entries = new Set((await readdir(parent, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name.normalize("NFC")));
  let name = base;
  let suffix = 2;
  while (entries.has(name.normalize("NFC"))) name = `${base}_${suffix++}`;
  const output = path.join(parent, name);
  await mkdir(output, { recursive: false });
  return output;
}

export function colorMatchVirtualPath(root: PersonSelectRoot & { canonicalPath: string }, absolutePath: string): string {
  return toPersonSelectVirtualPath(root, path.relative(root.canonicalPath, absolutePath).split(path.sep).join("/"));
}

export async function writeColorMatchManifest(manifest: ColorMatchManifest): Promise<string> {
  const folder = path.join(manifest.outputPath, ".olivia-color-match");
  await mkdir(folder, { recursive: true });
  const filePath = path.join(folder, "recipes.json");
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return filePath;
}
