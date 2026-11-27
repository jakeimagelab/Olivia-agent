import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ATTRIBUTE_TIME_TOLERANCE_SECONDS = 2;
export const CREATION_TIME_MISMATCH = "생성일 불일치";

const FORBIDDEN_ADDED_XATTRS = [
  "com.apple.quarantine",
  "com.apple.metadata:kMDItemWhereFroms",
] as const;

export type FileAttributeSnapshot = {
  size: number;
  mtimeSeconds: number;
  birthtimeSeconds: number;
  device: number;
  xattrs: Record<string, string>;
};

async function readXattrs(filePath: string): Promise<Record<string, string>> {
  if (process.platform !== "darwin") return {};
  const { stdout } = await execFileAsync("/usr/bin/xattr", [filePath], { maxBuffer: 4 * 1024 * 1024 });
  const names = stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
  const values = await Promise.all(names.map(async (name) => {
    const result = await execFileAsync("/usr/bin/xattr", ["-px", name, filePath], { maxBuffer: 4 * 1024 * 1024 });
    return [name, result.stdout.replace(/\s+/gu, "").toLocaleLowerCase("en-US")] as const;
  }));
  return Object.fromEntries(values);
}

async function darwinStatSeconds(filePath: string, format: "%m" | "%B", fallback: number): Promise<number> {
  if (process.platform !== "darwin") return Math.trunc(fallback / 1000);
  const { stdout } = await execFileAsync("/usr/bin/stat", ["-f", format, filePath]);
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : Math.trunc(fallback / 1000);
}

export async function readFileAttributeSnapshot(filePath: string): Promise<FileAttributeSnapshot> {
  const metadata = await stat(filePath);
  return {
    size: metadata.size,
    mtimeSeconds: await darwinStatSeconds(filePath, "%m", metadata.mtimeMs),
    birthtimeSeconds: await darwinStatSeconds(filePath, "%B", metadata.birthtimeMs),
    device: Number(metadata.dev),
    xattrs: await readXattrs(filePath),
  };
}

export function verifyFileAttributeSnapshot(
  source: FileAttributeSnapshot,
  destination: FileAttributeSnapshot,
): { ok: boolean; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (source.size !== destination.size) reasons.push(`크기 불일치 ${destination.size}/${source.size}`);
  if (Math.abs(source.mtimeSeconds - destination.mtimeSeconds) > ATTRIBUTE_TIME_TOLERANCE_SECONDS) reasons.push("수정일 불일치");
  if (Math.abs(source.birthtimeSeconds - destination.birthtimeSeconds) > ATTRIBUTE_TIME_TOLERANCE_SECONDS) reasons.push(CREATION_TIME_MISMATCH);
  for (const name of FORBIDDEN_ADDED_XATTRS) {
    if (!(name in source.xattrs) && name in destination.xattrs) {
      reasons.push(name === "com.apple.quarantine"
        ? "복사본에 격리 속성이 추가됨"
        : "복사본에 다운로드 출처 속성이 추가됨");
    }
  }
  const xattrNames = new Set([...Object.keys(source.xattrs), ...Object.keys(destination.xattrs)]);
  for (const name of xattrNames) {
    if (FORBIDDEN_ADDED_XATTRS.includes(name as typeof FORBIDDEN_ADDED_XATTRS[number])) continue;
    if (source.xattrs[name] !== destination.xattrs[name]) warnings.push(`확장속성 차이: ${name}`);
  }
  return { ok: reasons.length === 0, reasons, warnings };
}
