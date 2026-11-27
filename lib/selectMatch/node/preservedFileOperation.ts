import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  open,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  ATTRIBUTE_TIME_TOLERANCE_SECONDS,
  CREATION_TIME_MISMATCH,
  readFileAttributeSnapshot,
  verifyFileAttributeSnapshot,
  type FileAttributeSnapshot,
} from "@/lib/selectMatch/node/rawMatchFileAttributes";

const execFileAsync = promisify(execFile);
const DESTINATION_CONFLICT = "대상 폴더에 같은 이름의 다른 파일이 있습니다";

export type PreservedOperationResult = {
  source: string;
  destination: string;
  attributeVerified: true;
  moved: boolean;
  alreadyExisted: boolean;
  warnings: string[];
};

async function entryIfPresent(filePath: string): Promise<Stats | null> {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function fileSystemEntryExists(filePath: string): Promise<boolean> {
  return Boolean(await entryIfPresent(filePath));
}

function isSameFile(current: Stats | null, original: Stats): boolean {
  return Boolean(current && current.dev === original.dev && current.ino === original.ino
    && current.size === original.size && current.mtimeMs === original.mtimeMs && current.ctimeMs === original.ctimeMs);
}

async function assertUnchanged(filePath: string, original: Stats): Promise<void> {
  if (!isSameFile(await entryIfPresent(filePath), original)) throw new Error("작업 도중 파일이 변경되었습니다");
}

async function removeIfUnchanged(filePath: string, original: Stats): Promise<void> {
  if (isSameFile(await entryIfPresent(filePath), original)) await unlink(filePath);
}

// Reserve the exact name on the filesystem before renaming over our own empty entry.
// Exclusive creation also works on exFAT, where hard-link publication is unavailable.
async function renameIntoFreePath(source: string, destination: string): Promise<void> {
  const reservation = await open(destination, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error(DESTINATION_CONFLICT, { cause: error });
    throw error;
  });
  let reserved: Stats | undefined;
  try {
    reserved = await reservation.stat();
    await assertUnchanged(destination, reserved);
    await rename(source, destination);
  } catch (error) {
    if (reserved) await removeIfUnchanged(destination, reserved).catch(() => undefined);
    throw error;
  } finally {
    await reservation.close();
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  for await (const chunk of file.createReadStream()) hash.update(chunk);
  return hash.digest("hex");
}

async function sameContents(source: string, destination: string): Promise<boolean> {
  const [sourceHash, destinationHash] = await Promise.all([sha256(source), sha256(destination)]);
  return sourceHash === destinationHash;
}

async function verifyCopiedFile(
  source: string,
  sourceSnapshot: FileAttributeSnapshot,
  destination: string,
  allowCreationTimeWarning: boolean,
  bytesAlreadyVerified = false,
) {
  const checked = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(destination));
  if (checked.ok) return { warnings: checked.warnings, bytesAlreadyVerified };
  if (allowCreationTimeWarning && checked.reasons.length === 1 && checked.reasons[0] === CREATION_TIME_MISMATCH) {
    if (!bytesAlreadyVerified && !await sameContents(source, destination)) throw new Error("복사본 SHA-256 불일치");
    return { warnings: [...checked.warnings, "생성일 차이 · 파일 내용 SHA-256 일치"], bytesAlreadyVerified: true };
  }
  throw new Error(`속성 확인 실패: ${checked.reasons.join(", ")}`);
}

/** Finder 복사와 같은 ditto/rename 경로만 사용하며 대상 파일을 절대 덮어쓰지 않는다. */
export async function copyOrMovePreservingMetadata(input: {
  source: string;
  destinationDirectory: string;
  move: boolean;
}): Promise<PreservedOperationResult> {
  const sourceMetadata = await lstat(input.source);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) throw new Error("원본이 안전한 파일이 아닙니다.");
  const source = await realpath(input.source);
  const destinationDirectory = await realpath(input.destinationDirectory);
  const destination = path.join(destinationDirectory, path.basename(source));
  if (source === destination) return { source, destination, attributeVerified: true, moved: input.move, alreadyExisted: true, warnings: [] };
  const sourceSnapshot = await readFileAttributeSnapshot(source);
  const existingDestination = await entryIfPresent(destination);
  if (existingDestination) {
    if (!existingDestination.isFile()) throw new Error("대상 항목이 안전한 파일이 아닙니다");
    const destinationSnapshot = await readFileAttributeSnapshot(destination);
    if (sourceSnapshot.size !== destinationSnapshot.size
      || Math.abs(sourceSnapshot.mtimeSeconds - destinationSnapshot.mtimeSeconds) > ATTRIBUTE_TIME_TOLERANCE_SECONDS
      || !await sameContents(source, destination)) {
      throw new Error(DESTINATION_CONFLICT);
    }
    await assertUnchanged(source, sourceMetadata);
    await assertUnchanged(destination, existingDestination);
    const checked = verifyFileAttributeSnapshot(sourceSnapshot, destinationSnapshot);
    const forbiddenReasons = checked.reasons.filter((reason) => reason.includes("격리 속성") || reason.includes("다운로드 출처 속성"));
    if (forbiddenReasons.length) throw new Error(`속성 확인 실패: ${forbiddenReasons.join(", ")}`);
    const warnings = [
      ...checked.warnings,
      ...checked.reasons.filter((reason) => !forbiddenReasons.includes(reason)),
    ];
    if (input.move) await unlink(source);
    return { source, destination, attributeVerified: true, moved: input.move, alreadyExisted: true, warnings };
  }

  const destinationDirectoryMetadata = await stat(destinationDirectory);
  const sameVolume = Number(sourceMetadata.dev) === Number(destinationDirectoryMetadata.dev);

  if (input.move && sameVolume) {
    await assertUnchanged(source, sourceMetadata);
    await renameIntoFreePath(source, destination);
    const moved = await lstat(destination);
    try {
      const checked = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(destination));
      if (!checked.ok) throw new Error(`속성 확인 실패: ${checked.reasons.join(", ")}`);
      return { source, destination, attributeVerified: true, moved: true, alreadyExisted: false, warnings: checked.warnings };
    } catch (error) {
      try {
        await assertUnchanged(destination, moved);
        await renameIntoFreePath(destination, source);
      } catch {
        throw new Error(`이동 후 오류로 원래 위치를 복구하지 못했습니다. 결과 위치를 확인해 주세요. ${destination}`, { cause: error });
      }
      throw error;
    }
  }

  const temporary = path.join(destinationDirectory, `.olivia-copy-${randomUUID()}-${path.basename(source)}`);
  let published: Stats | undefined;
  try {
    await execFileAsync("/usr/bin/ditto", [source, temporary], { maxBuffer: 4 * 1024 * 1024 });
    // 일부 SMB/NAS 서버는 ditto가 보존한 mtime을 파일 생성 시각으로 다시 쓴다.
    // 원본은 건드리지 않고 복사본의 수정일만 원본과 재동기화한다.
    await execFileAsync("/usr/bin/touch", ["-r", source, temporary], { maxBuffer: 4 * 1024 * 1024 });
    const checked = await verifyCopiedFile(source, sourceSnapshot, temporary, !input.move);
    await assertUnchanged(source, sourceMetadata);
    await renameIntoFreePath(temporary, destination);
    published = await lstat(destination);
    const finalCheck = await verifyCopiedFile(source, sourceSnapshot, destination, !input.move, checked.bytesAlreadyVerified);
    if (input.move) {
      if (!await sameContents(source, destination)) throw new Error("복사본 SHA-256 불일치");
      await assertUnchanged(source, sourceMetadata);
      await assertUnchanged(destination, published);
      await unlink(source);
    }
    return { source, destination, attributeVerified: true, moved: input.move, alreadyExisted: false, warnings: finalCheck.warnings };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (published && (!input.move || await fileSystemEntryExists(source))) await removeIfUnchanged(destination, published).catch(() => undefined);
    throw error;
  }
}
