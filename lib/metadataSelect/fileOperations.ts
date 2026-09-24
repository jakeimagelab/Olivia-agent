import { copyFileStreamedAndVerify } from "@/lib/metadataSelect/copy";

export type MetadataFileTransfer = {
  name: string;
  sourceDirectory: FileSystemDirectoryHandle;
  sourceHandle: FileSystemFileHandle;
};

export type FileOperationProgress = (completed: number, total: number, name: string) => void;

export class MetadataFileOperationError extends Error {
  readonly rollbackFailures: string[];

  constructor(message: string, rollbackFailures: string[] = []) {
    super(message);
    this.name = "MetadataFileOperationError";
    this.rollbackFailures = rollbackFailures;
  }
}

function isNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && "name" in error && error.name === "NotFoundError";
}

export async function fileExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await (directory as any).getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function assertNoDestinationCollisions(
  destination: FileSystemDirectoryHandle | null,
  transfers: readonly MetadataFileTransfer[],
): Promise<void> {
  const duplicateNames = new Set<string>();
  const seen = new Set<string>();
  for (const transfer of transfers) {
    const key = transfer.name.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(key)) duplicateNames.add(transfer.name);
    seen.add(key);
  }
  if (duplicateNames.size > 0) {
    throw new Error(`같은 대상 파일명이 중복됩니다: ${Array.from(duplicateNames).join(", ")}`);
  }
  if (!destination) return;

  const collisions: string[] = [];
  for (const transfer of transfers) {
    if (await fileExists(destination, transfer.name)) collisions.push(transfer.name);
  }
  if (collisions.length > 0) {
    throw new Error(`대상 폴더에 같은 이름의 파일이 있습니다: ${collisions.join(", ")}`);
  }
}

async function removeCreatedFiles(directory: FileSystemDirectoryHandle, names: readonly string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const name of names) {
    try {
      await (directory as any).removeEntry(name);
    } catch (error) {
      if (isNotFoundError(error)) continue;
      failures.push(`${name}: ${error instanceof Error ? error.message : "정리 실패"}`);
    }
  }
  return failures;
}

/**
 * Browser File System Access API에는 rename/transaction이 없으므로 copy→size verify→delete로 이동한다.
 * 정상 API 오류는 가능한 범위에서 되돌리고, 되돌리지 못한 파일은 예외에 정확히 기록한다.
 */
export async function transferFilesSafely({
  transfers,
  destination,
  deleteSources,
  onProgress,
}: {
  transfers: readonly MetadataFileTransfer[];
  destination: FileSystemDirectoryHandle;
  deleteSources: boolean;
  onProgress?: FileOperationProgress;
}): Promise<{ createdNames: string[] }> {
  await assertNoDestinationCollisions(destination, transfers);
  const createdNames: string[] = [];
  const attemptedNames: string[] = [];

  try {
    for (const [index, transfer] of transfers.entries()) {
      attemptedNames.push(transfer.name);
      await copyFileStreamedAndVerify(transfer.sourceHandle, destination, transfer.name);
      createdNames.push(transfer.name);
      onProgress?.(index + 1, transfers.length, transfer.name);
    }
  } catch (error) {
    const rollbackFailures = await removeCreatedFiles(destination, attemptedNames);
    throw new MetadataFileOperationError(
      `파일 복사 단계에서 중단했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      rollbackFailures,
    );
  }

  if (!deleteSources) return { createdNames };

  const deleted: MetadataFileTransfer[] = [];
  try {
    for (const transfer of transfers) {
      await (transfer.sourceDirectory as any).removeEntry(transfer.name);
      deleted.push(transfer);
    }
  } catch (error) {
    const restoreFailures: string[] = [];
    const restored = new Set<string>();
    for (const transfer of deleted) {
      try {
        const copiedHandle = await (destination as any).getFileHandle(transfer.name) as FileSystemFileHandle;
        await copyFileStreamedAndVerify(copiedHandle, transfer.sourceDirectory, transfer.name);
        restored.add(transfer.name);
      } catch (restoreError) {
        restoreFailures.push(`${transfer.name}: ${restoreError instanceof Error ? restoreError.message : "원본 복원 실패"}`);
      }
    }

    const cleanupTargets = createdNames.filter((name) => !deleted.some((item) => item.name === name) || restored.has(name));
    const cleanupFailures = await removeCreatedFiles(destination, cleanupTargets);
    throw new MetadataFileOperationError(
      `원본 삭제 단계에서 중단해 복원을 시도했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      [...restoreFailures, ...cleanupFailures],
    );
  }

  return { createdNames };
}

export async function removeTransferredCopies(
  destination: FileSystemDirectoryHandle,
  names: readonly string[],
): Promise<string[]> {
  return removeCreatedFiles(destination, names);
}
