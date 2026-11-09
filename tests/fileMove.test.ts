import { describe, expect, it, vi } from "vitest";
import { moveFileFast } from "@/lib/photo-classifier/file-move";

type TestSource = FileSystemFileHandle & {
  getFile: ReturnType<typeof vi.fn>;
  move?: ReturnType<typeof vi.fn>;
};

function sourceFile(contents: string, move?: (destination: FileSystemDirectoryHandle, name: string) => Promise<void>): TestSource {
  const blob = new Blob([contents]);
  return {
    getFile: vi.fn(async () => ({
      size: blob.size,
      stream: () => blob.stream(),
      arrayBuffer: vi.fn(() => Promise.reject(new Error("arrayBuffer must not be used"))),
    } as unknown as File)),
    ...(move ? { move: vi.fn(move) } : {}),
  } as unknown as TestSource;
}

function destinationDirectory(options: { failWrite?: boolean; existing?: boolean } = {}) {
  const chunks: Uint8Array[] = [];
  const removeEntry = vi.fn(async () => undefined);
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (options.failWrite) throw new Error("disk full");
      chunks.push(chunk);
    },
  });
  const createWritable = vi.fn(async () => writable as unknown as FileSystemWritableFileStream);
  const getFileHandle = vi.fn(async (_name: string, handleOptions?: FileSystemGetFileOptions) => {
    if (!options.existing && handleOptions?.create !== true) throw new DOMException("Not found", "NotFoundError");
    return { createWritable } as unknown as FileSystemFileHandle;
  });
  const directory = { getFileHandle, removeEntry } as unknown as FileSystemDirectoryHandle;
  return { chunks, createWritable, directory, getFileHandle, removeEntry };
}

describe("moveFileFast", () => {
  it("uses native move without reading the file when the browser supports it", async () => {
    const src = sourceFile("photo", async () => undefined);
    const destination = destinationDirectory();

    await expect(moveFileFast({ src, destDir: destination.directory, fileName: "A.JPG" }))
      .resolves.toEqual({ method: "native-move" });

    expect(src.move).toHaveBeenCalledWith(destination.directory, "A.JPG");
    expect(src.getFile).not.toHaveBeenCalled();
    expect(destination.getFileHandle).not.toHaveBeenCalled();
  });

  it("streams the file to the destination when native move is unavailable", async () => {
    const src = sourceFile("streamed-photo");
    const destination = destinationDirectory();

    await expect(moveFileFast({ src, destDir: destination.directory, fileName: "A.JPG" }))
      .resolves.toEqual({ method: "copy-delete", nativeMoveError: null });

    expect(new TextDecoder().decode(Buffer.concat(destination.chunks.map((chunk) => Buffer.from(chunk))))).toBe("streamed-photo");
    const file = await src.getFile.mock.results[0].value;
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(destination.removeEntry).not.toHaveBeenCalled();
  });

  it("preserves the native failure and removes a partial destination when streaming fails", async () => {
    const src = sourceFile("photo");
    const destination = destinationDirectory({ failWrite: true });

    await expect(moveFileFast({ src, destDir: destination.directory, fileName: "A.JPG" }))
      .rejects.toThrow("disk full");

    expect(destination.removeEntry).toHaveBeenCalledWith("A.JPG");
  });

  it("falls back only for an unsupported native move and reports that reason", async () => {
    const nativeError = new DOMException("move is not supported", "NotSupportedError");
    const src = sourceFile("photo", async () => { throw nativeError; });
    const destination = destinationDirectory();

    await expect(moveFileFast({ src, destDir: destination.directory, fileName: "A.JPG" }))
      .resolves.toEqual({ method: "copy-delete", nativeMoveError: nativeError });
  });

  it("does not copy after a permission failure or over an existing destination", async () => {
    const permissionError = new DOMException("permission denied", "NotAllowedError");
    const denied = sourceFile("photo", async () => { throw permissionError; });
    const emptyDestination = destinationDirectory();
    await expect(moveFileFast({ src: denied, destDir: emptyDestination.directory, fileName: "A.JPG" }))
      .rejects.toBe(permissionError);
    expect(denied.getFile).not.toHaveBeenCalled();

    const noNativeMove = sourceFile("photo");
    const existingDestination = destinationDirectory({ existing: true });
    await expect(moveFileFast({ src: noNativeMove, destDir: existingDestination.directory, fileName: "A.JPG" }))
      .rejects.toThrow("대상 파일이 이미 있어");
    expect(noNativeMove.getFile).not.toHaveBeenCalled();
  });
});
