import { describe, expect, it } from "vitest";
import {
  assertNoDestinationCollisions,
  MetadataFileOperationError,
  transferFilesSafely,
  type MetadataFileTransfer,
} from "@/lib/metadataSelect/fileOperations";
import { copyFileStreamedAndVerify } from "@/lib/metadataSelect/copy";
import { JPG_RETOUCHED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";

function notFound(name: string): Error {
  return Object.assign(new Error(`${name} not found`), { name: "NotFoundError" });
}

class MemoryFileHandle {
  readonly kind = "file" as const;
  constructor(public name: string, public bytes: Uint8Array, private failWrite = false, private corruptWrite = false) {}

  async getFile() {
    const copy = new Uint8Array(this.bytes.byteLength);
    copy.set(this.bytes);
    return new File([copy.buffer as ArrayBuffer], this.name);
  }

  async createWritable() {
    if (this.failWrite) throw new Error(`write failed: ${this.name}`);
    const chunks: Uint8Array[] = [];
    const owner = this;
    return new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      },
      close() {
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        owner.bytes = merged;
        if (owner.corruptWrite && owner.bytes.byteLength > 0) owner.bytes[0] ^= 0xff;
      },
    });
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory" as const;
  readonly files = new Map<string, MemoryFileHandle>();
  failWriteName: string | null = null;
  corruptWriteName: string | null = null;
  failDeleteName: string | null = null;

  constructor(public name: string) {}

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw notFound(name);
    const handle = new MemoryFileHandle(name, new Uint8Array(), this.failWriteName === name, this.corruptWriteName === name);
    this.files.set(name, handle);
    return handle;
  }

  async removeEntry(name: string) {
    if (this.failDeleteName === name) throw new Error(`delete failed: ${name}`);
    if (!this.files.delete(name)) throw notFound(name);
  }
}

function addFile(directory: MemoryDirectoryHandle, name: string, text: string): MemoryFileHandle {
  const handle = new MemoryFileHandle(name, new TextEncoder().encode(text));
  directory.files.set(name, handle);
  return handle;
}

function transfer(directory: MemoryDirectoryHandle, name: string): MetadataFileTransfer {
  return {
    name,
    sourceDirectory: directory as unknown as FileSystemDirectoryHandle,
    sourceHandle: directory.files.get(name) as unknown as FileSystemFileHandle,
  };
}

describe("metadata select safe file transfers", () => {
  it("stops before writing when a destination name collides", async () => {
    const source = new MemoryDirectoryHandle("JPG전체");
    const destination = new MemoryDirectoryHandle(JPG_RETOUCHED_DIRECTORY);
    addFile(source, "A.jpg", "source");
    addFile(destination, "A.jpg", "existing");

    await expect(assertNoDestinationCollisions(
      destination as unknown as FileSystemDirectoryHandle,
      [transfer(source, "A.jpg")],
    )).rejects.toThrow("같은 이름");
    expect(source.files.get("A.jpg")?.bytes).toEqual(new TextEncoder().encode("source"));
    expect(destination.files.get("A.jpg")?.bytes).toEqual(new TextEncoder().encode("existing"));
  });

  it("removes every newly created destination when copying fails", async () => {
    const source = new MemoryDirectoryHandle("JPG전체");
    const destination = new MemoryDirectoryHandle(JPG_RETOUCHED_DIRECTORY);
    addFile(source, "A.jpg", "a");
    addFile(source, "B.jpg", "b");
    destination.failWriteName = "B.jpg";

    await expect(transferFilesSafely({
      transfers: [transfer(source, "A.jpg"), transfer(source, "B.jpg")],
      destination: destination as unknown as FileSystemDirectoryHandle,
      deleteSources: true,
    })).rejects.toBeInstanceOf(MetadataFileOperationError);

    expect(Array.from(source.files.keys())).toEqual(["A.jpg", "B.jpg"]);
    expect(Array.from(destination.files.keys())).toEqual([]);
  });

  it("restores deleted originals and clears destinations when deletion fails", async () => {
    const source = new MemoryDirectoryHandle("JPG전체");
    const destination = new MemoryDirectoryHandle(JPG_RETOUCHED_DIRECTORY);
    addFile(source, "A.jpg", "a");
    addFile(source, "B.jpg", "b");
    source.failDeleteName = "B.jpg";

    await expect(transferFilesSafely({
      transfers: [transfer(source, "A.jpg"), transfer(source, "B.jpg")],
      destination: destination as unknown as FileSystemDirectoryHandle,
      deleteSources: true,
    })).rejects.toThrow("복원을 시도");

    expect(new TextDecoder().decode(source.files.get("A.jpg")?.bytes)).toBe("a");
    expect(new TextDecoder().decode(source.files.get("B.jpg")?.bytes)).toBe("b");
    expect(Array.from(destination.files.keys())).toEqual([]);
  });

  it("moves every JPG only after all copies are verified", async () => {
    const source = new MemoryDirectoryHandle(JPG_RETOUCHED_DIRECTORY);
    const destination = new MemoryDirectoryHandle("JPG전체");
    addFile(source, "A.jpg", "aaa");
    addFile(source, "B.jpg", "bbb");

    await transferFilesSafely({
      transfers: [transfer(source, "A.jpg"), transfer(source, "B.jpg")],
      destination: destination as unknown as FileSystemDirectoryHandle,
      deleteSources: true,
    });

    expect(Array.from(source.files.keys())).toEqual([]);
    expect(new TextDecoder().decode(destination.files.get("A.jpg")?.bytes)).toBe("aaa");
    expect(new TextDecoder().decode(destination.files.get("B.jpg")?.bytes)).toBe("bbb");
  });

  it("rejects equal-size corrupted copies by SHA-256 and leaves the original untouched", async () => {
    const source = new MemoryDirectoryHandle("JPG전체");
    const destination = new MemoryDirectoryHandle("Selected_RAW");
    addFile(source, "A.jpg", "same-size bytes");
    destination.corruptWriteName = "A.jpg";

    await expect(copyFileStreamedAndVerify(
      source.files.get("A.jpg") as unknown as FileSystemFileHandle,
      destination as unknown as FileSystemDirectoryHandle,
      "A.jpg",
    )).rejects.toThrow("SHA-256");

    expect(new TextDecoder().decode(source.files.get("A.jpg")?.bytes)).toBe("same-size bytes");
  });

  it("rolls back a SHA-256 failure and keeps every original in a batch", async () => {
    const source = new MemoryDirectoryHandle("JPG전체");
    const destination = new MemoryDirectoryHandle("Selected_RAW");
    addFile(source, "A.jpg", "first");
    addFile(source, "B.jpg", "second");
    destination.corruptWriteName = "B.jpg";

    await expect(transferFilesSafely({
      transfers: [transfer(source, "A.jpg"), transfer(source, "B.jpg")],
      destination: destination as unknown as FileSystemDirectoryHandle,
      deleteSources: true,
    })).rejects.toThrow("SHA-256");

    expect(Array.from(source.files.keys())).toEqual(["A.jpg", "B.jpg"]);
    expect(Array.from(destination.files.keys())).toEqual([]);
  });

  it("supports a same-folder safe rename without deleting the source before verification", async () => {
    const directory = new MemoryDirectoryHandle("학생");
    addFile(directory, "IMG_1001.JPG", "source-bytes");
    const source = directory.files.get("IMG_1001.JPG") as MemoryFileHandle;

    await transferFilesSafely({
      transfers: [{
        name: "학생_IMG_1001.JPG",
        sourceName: "IMG_1001.JPG",
        destinationName: "학생_IMG_1001.JPG",
        sourceDirectory: directory as unknown as FileSystemDirectoryHandle,
        sourceHandle: source as unknown as FileSystemFileHandle,
        destinationDirectory: directory as unknown as FileSystemDirectoryHandle,
      }],
      destination: directory as unknown as FileSystemDirectoryHandle,
      deleteSources: true,
    });

    expect(directory.files.has("IMG_1001.JPG")).toBe(false);
    expect(new TextDecoder().decode(directory.files.get("학생_IMG_1001.JPG")?.bytes)).toBe("source-bytes");
  });
});
