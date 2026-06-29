async function copyFileHandle(
  src: FileSystemFileHandle,
  dest: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  const file = await src.getFile();
  const buf  = await file.arrayBuffer();
  const fh   = await (dest as any).getFileHandle(fileName, { create: true });
  const wr   = await fh.createWritable();
  await wr.write(buf);
  await wr.close();
}

export async function moveFileFast({
  src,
  destDir,
  fileName,
}: {
  src: FileSystemFileHandle;
  destDir: FileSystemDirectoryHandle;
  fileName: string;
}): Promise<{ method: "native-move" | "copy-delete" }> {
  const anySrc = src as any;

  if (typeof anySrc.move === "function") {
    try {
      await anySrc.move(destDir, fileName);
      return { method: "native-move" };
    } catch {
      // native move failed — fall through to copy-delete
    }
  }

  await copyFileHandle(src, destDir, fileName);
  return { method: "copy-delete" };
}
