async function copyFileHandle(
  src: FileSystemFileHandle,
  dest: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  try {
    await dest.getFileHandle(fileName);
    throw new Error(`${fileName} 대상 파일이 이미 있어 덮어쓰지 않았습니다.`);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  const file = await src.getFile();
  const fh = await dest.getFileHandle(fileName, { create: true });
  const writer = await fh.createWritable();
  try {
    // File 전체를 arrayBuffer로 만들면 대형 JPG마다 메모리 할당과 복사가 한 번 더
    // 발생한다. 스트림을 바로 연결해 브라우저 메모리 사용을 제한한다.
    await file.stream().pipeTo(writer);
  } catch (error) {
    // pipeTo가 writer를 abort하더라도 일부 브라우저는 빈/부분 파일을 남길 수 있다.
    // 원본은 호출자가 검증 뒤에만 삭제하므로 여기서는 새 목적지만 정리한다.
    await writer.abort(error).catch(() => undefined);
    await dest.removeEntry(fileName).catch(() => undefined);
    throw error;
  }
}

export type MoveFileResult =
  | { method: "native-move" }
  | { method: "copy-delete"; nativeMoveError: unknown | null };

function canSafelyFallbackFromNativeMove(error: unknown): boolean {
  return error instanceof TypeError
    || (error instanceof DOMException && error.name === "NotSupportedError");
}

export async function moveFileFast({
  src,
  destDir,
  fileName,
}: {
  src: FileSystemFileHandle;
  destDir: FileSystemDirectoryHandle;
  fileName: string;
}): Promise<MoveFileResult> {
  const anySrc = src as any;
  let nativeMoveError: unknown | null = null;

  if (typeof anySrc.move === "function") {
    try {
      await anySrc.move(destDir, fileName);
      return { method: "native-move" };
    } catch (error) {
      if (!canSafelyFallbackFromNativeMove(error)) throw error;
      nativeMoveError = error;
    }
  }

  await copyFileHandle(src, destDir, fileName);
  return { method: "copy-delete", nativeMoveError };
}
