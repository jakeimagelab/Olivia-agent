import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
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

export type PreservedOperationResult = {
  source: string;
  destination: string;
  attributeVerified: true;
  moved: boolean;
  alreadyExisted: boolean;
  warnings: string[];
};

export async function fileSystemEntryExists(destination: string): Promise<boolean> {
  try {
    await lstat(destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
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
    if (!bytesAlreadyVerified) {
      const [originalHash, copiedHash] = await Promise.all([sha256(source), sha256(destination)]);
      if (originalHash !== copiedHash) throw new Error("복사본 SHA-256 불일치");
    }
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
  const source = await realpath(input.source);
  const sourceMetadata = await lstat(source);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) throw new Error("원본이 안전한 파일이 아닙니다.");
  const destinationDirectory = await realpath(input.destinationDirectory);
  const destination = path.join(destinationDirectory, path.basename(source));
  const sourceSnapshot = await readFileAttributeSnapshot(source);
  if (await fileSystemEntryExists(destination)) {
    const destinationSnapshot = await readFileAttributeSnapshot(destination);
    if (sourceSnapshot.size !== destinationSnapshot.size
      || Math.abs(sourceSnapshot.mtimeSeconds - destinationSnapshot.mtimeSeconds) > ATTRIBUTE_TIME_TOLERANCE_SECONDS) {
      throw new Error("대상 폴더에 같은 이름이 있어 덮어쓰지 않음");
    }
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
    await rename(source, destination);
    try {
      const checked = verifyFileAttributeSnapshot(sourceSnapshot, await readFileAttributeSnapshot(destination));
      if (!checked.ok) throw new Error(`속성 확인 실패: ${checked.reasons.join(", ")}`);
      return { source, destination, attributeVerified: true, moved: true, alreadyExisted: false, warnings: checked.warnings };
    } catch (error) {
      if (!(await fileSystemEntryExists(source))) await rename(destination, source).catch(() => undefined);
      throw error;
    }
  }

  const temporary = path.join(destinationDirectory, `.olivia-copy-${randomUUID()}-${path.basename(source)}`);
  let published = false;
  try {
    await execFileAsync("/usr/bin/ditto", [source, temporary], { maxBuffer: 4 * 1024 * 1024 });
    // 일부 SMB/NAS 서버는 ditto가 보존한 mtime을 파일 생성 시각으로 다시 쓴다.
    // 원본은 건드리지 않고 복사본의 수정일만 원본과 재동기화한다.
    await execFileAsync("/usr/bin/touch", ["-r", source, temporary], { maxBuffer: 4 * 1024 * 1024 });
    const checked = await verifyCopiedFile(source, sourceSnapshot, temporary, !input.move);
    if (await fileSystemEntryExists(destination)) throw new Error("대상 폴더에 같은 이름이 있어 덮어쓰지 않음");
    await rename(temporary, destination);
    published = true;
    const finalCheck = await verifyCopiedFile(source, sourceSnapshot, destination, !input.move, checked.bytesAlreadyVerified);
    if (input.move) await unlink(source);
    return { source, destination, attributeVerified: true, moved: input.move, alreadyExisted: false, warnings: finalCheck.warnings };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (published && (!input.move || await fileSystemEntryExists(source))) await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
}
