// RAW 파일은 수십~수백 MB일 수 있어 arrayBuffer()로 전체를 메모리에 올리지 않고 스트리밍으로 복사한다.
// (video-sorting/page.tsx와 동일한 패턴 — 기존 셀렉/매칭 파일은 건드리지 않고 이 기능 전용으로 둔다.)
export async function copyFileStreamed(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await file.stream().pipeTo(wr);
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("이 브라우저에서 SHA-256 검증을 지원하지 않습니다.");
  // Web Crypto는 스트리밍 digest API를 제공하지 않는다. 대량 작업은 이 함수를 파일 하나씩
  // 순차 호출해 동시에 여러 원본을 메모리에 올리지 않는다.
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function copyFileStreamedAndVerify(
  src: FileSystemFileHandle,
  dest: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle> {
  const sourceFile = await src.getFile();
  const destinationHandle = await (dest as any).getFileHandle(name, { create: true }) as FileSystemFileHandle;
  const writable = await (destinationHandle as any).createWritable();
  await sourceFile.stream().pipeTo(writable);
  const destinationFile = await destinationHandle.getFile();
  if (destinationFile.size !== sourceFile.size) {
    throw new Error(`${name} 복사 크기 검증에 실패했습니다 (${sourceFile.size} → ${destinationFile.size} bytes).`);
  }
  const sourceHash = await sha256(sourceFile);
  const destinationHash = await sha256(destinationFile);
  if (sourceHash !== destinationHash) {
    throw new Error(`${name} 복사 SHA-256 검증에 실패했습니다.`);
  }
  return destinationHandle;
}
