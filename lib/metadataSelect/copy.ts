// RAW 파일은 수십~수백 MB일 수 있어 arrayBuffer()로 전체를 메모리에 올리지 않고 스트리밍으로 복사한다.
// (video-sorting/page.tsx와 동일한 패턴 — 기존 셀렉/매칭 파일은 건드리지 않고 이 기능 전용으로 둔다.)
export async function copyFileStreamed(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await file.stream().pipeTo(wr);
}
