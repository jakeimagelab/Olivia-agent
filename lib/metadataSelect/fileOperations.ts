import { copyFileStreamedAndVerify } from "@/lib/metadataSelect/copy";

export type MetadataFileTransfer = {
  /** 기존 소비자 호환용 기본 목적지 이름. */
  name: string;
  sourceDirectory: FileSystemDirectoryHandle;
  sourceHandle: FileSystemFileHandle;
  /** 이름변경처럼 원본과 새 이름이 다를 때 사용한다. */
  sourceName?: string;
  destinationName?: string;
  /** 같은 배치에서 하위 폴더별 목적지가 다를 때 사용한다. */
  destinationDirectory?: FileSystemDirectoryHandle;
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

function sourceNameOf(transfer: MetadataFileTransfer): string {
  return transfer.sourceName ?? transfer.sourceHandle.name ?? transfer.name;
}

function destinationNameOf(transfer: MetadataFileTransfer): string {
  return transfer.destinationName ?? transfer.name;
}

function destinationDirectoryOf(
  transfer: MetadataFileTransfer,
  fallback: FileSystemDirectoryHandle | null,
): FileSystemDirectoryHandle {
  const destination = transfer.destinationDirectory ?? fallback;
  if (!destination) throw new Error(`${destinationNameOf(transfer)}: 대상 폴더가 없습니다.`);
  return destination;
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
  const directoryIds = new Map<FileSystemDirectoryHandle, number>();
  let nextDirectoryId = 0;
  const directoryId = (directory: FileSystemDirectoryHandle) => {
    const existing = directoryIds.get(directory);
    if (existing !== undefined) return existing;
    const value = nextDirectoryId++;
    directoryIds.set(directory, value);
    return value;
  };
  for (const transfer of transfers) {
    const directory = destinationDirectoryOf(transfer, destination);
    const key = `${directoryId(directory)}:${destinationNameOf(transfer).normalize("NFC").toLocaleLowerCase("en-US")}`;
    if (seen.has(key)) duplicateNames.add(destinationNameOf(transfer));
    seen.add(key);
  }
  if (duplicateNames.size > 0) {
    throw new Error(`같은 대상 파일명이 중복됩니다: ${Array.from(duplicateNames).join(", ")}`);
  }
  const collisions: string[] = [];
  for (const transfer of transfers) {
    const directory = destinationDirectoryOf(transfer, destination);
    const name = destinationNameOf(transfer);
    if (await fileExists(directory, name)) collisions.push(name);
  }
  if (collisions.length > 0) {
    throw new Error(`대상 폴더에 같은 이름의 파일이 있습니다: ${collisions.join(", ")}`);
  }
}

type CreatedFile = { directory: FileSystemDirectoryHandle; name: string };

async function removeCreatedFiles(created: readonly CreatedFile[]): Promise<string[]> {
  const failures: string[] = [];
  for (const { directory, name } of created) {
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
  const created: CreatedFile[] = [];
  const attempted: CreatedFile[] = [];

  try {
    for (const [index, transfer] of transfers.entries()) {
      const targetDirectory = destinationDirectoryOf(transfer, destination);
      const targetName = destinationNameOf(transfer);
      attempted.push({ directory: targetDirectory, name: targetName });
      await copyFileStreamedAndVerify(transfer.sourceHandle, targetDirectory, targetName);
      created.push({ directory: targetDirectory, name: targetName });
      onProgress?.(index + 1, transfers.length, targetName);
    }
  } catch (error) {
    const rollbackFailures = await removeCreatedFiles(attempted);
    throw new MetadataFileOperationError(
      `파일 복사 단계에서 중단했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      rollbackFailures,
    );
  }

  if (!deleteSources) return { createdNames: created.map((item) => item.name) };

  const deleted: MetadataFileTransfer[] = [];
  try {
    for (const transfer of transfers) {
      await (transfer.sourceDirectory as any).removeEntry(sourceNameOf(transfer));
      deleted.push(transfer);
    }
  } catch (error) {
    const restoreFailures: string[] = [];
    const restored = new Set<MetadataFileTransfer>();
    for (const transfer of deleted) {
      try {
        const targetDirectory = destinationDirectoryOf(transfer, destination);
        const copiedHandle = await (targetDirectory as any).getFileHandle(destinationNameOf(transfer)) as FileSystemFileHandle;
        await copyFileStreamedAndVerify(copiedHandle, transfer.sourceDirectory, sourceNameOf(transfer));
        restored.add(transfer);
      } catch (restoreError) {
        restoreFailures.push(`${sourceNameOf(transfer)}: ${restoreError instanceof Error ? restoreError.message : "원본 복원 실패"}`);
      }
    }

    const cleanupTargets = created.filter((createdFile) => {
      const transfer = transfers.find((item) => (
        destinationDirectoryOf(item, destination) === createdFile.directory
        && destinationNameOf(item) === createdFile.name
      ));
      return !transfer || !deleted.includes(transfer) || restored.has(transfer);
    });
    const cleanupFailures = await removeCreatedFiles(cleanupTargets);
    throw new MetadataFileOperationError(
      `원본 삭제 단계에서 중단해 복원을 시도했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      [...restoreFailures, ...cleanupFailures],
    );
  }

  return { createdNames: created.map((item) => item.name) };
}

export async function removeTransferredCopies(
  destination: FileSystemDirectoryHandle,
  names: readonly string[],
): Promise<string[]> {
  return removeCreatedFiles(names.map((name) => ({ directory: destination, name })));
}
