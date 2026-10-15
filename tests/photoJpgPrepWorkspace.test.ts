import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildJpgPrepPlan, isJpgIntegratedRoot } from "@/components/photo-workspace/PhotoJpgPrepWorkspace";

type TestEntry = TestDirectory | TestFile;

class TestFile {
  readonly kind = "file" as const;
  constructor(readonly name: string, readonly size: number, readonly lastModified: number) {}
  async getFile() { return { name: this.name, size: this.size, lastModified: this.lastModified } as File; }
}

class TestDirectory {
  readonly kind = "directory" as const;
  readonly children = new Map<string, TestEntry>();
  constructor(readonly name: string) {}
  add(entry: TestEntry) { this.children.set(entry.name, entry); return this; }
  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const entry of this.children.values()) yield [entry.name, entry as unknown as FileSystemHandle];
  }
  async getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle> {
    const entry = this.children.get(name);
    if (entry instanceof TestDirectory) return entry as unknown as FileSystemDirectoryHandle;
    throw new DOMException("Not found", "NotFoundError");
  }
  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    const entry = this.children.get(name);
    if (entry instanceof TestFile) return entry as unknown as FileSystemFileHandle;
    throw new DOMException("Not found", "NotFoundError");
  }
}

describe("JPG정리 계획", () => {
  it("plans only JPG moves, preserves subfolders, and never plans a RAW operation", async () => {
    const root = new TestDirectory("촬영");
    root.add(new TestFile("A.CR3", 900, 10));
    root.add(new TestFile("A.JPG", 300, 10));
    const sub = new TestDirectory("2차").add(new TestFile("B.jpeg", 400, 20)).add(new TestFile("B.NEF", 1_000, 20));
    root.add(sub);

    const plan = await buildJpgPrepPlan(root as unknown as FileSystemDirectoryHandle, {
      includeSubdirectories: true,
      preserveStructure: true,
    });

    expect(plan.rawUntouched).toBe(2);
    expect(plan.hiddenExcluded).toBe(0);
    expect(plan.rows.map((row) => [row.name, row.destinationPath, row.status])).toEqual([
      ["B.jpeg", "JPG전체/2차/B.jpeg", "move"],
      ["A.JPG", "JPG전체/A.JPG", "move"],
    ]);
    expect(plan.rows.some((row) => /\.(cr3|nef)$/i.test(row.name))).toBe(false);
  });

  it("excludes hidden files and folders before checking photo extensions", async () => {
    const root = new TestDirectory("촬영")
      .add(new TestFile("A.JPG", 300, 10))
      .add(new TestFile("._A.JPG", 4_096, 10))
      .add(new TestFile("._A.CR3", 4_096, 10))
      .add(new TestFile(".DS_Store", 512, 10));
    root.add(new TestDirectory(".Trashes").add(new TestFile("hidden.JPG", 300, 10)));
    root.add(new TestDirectory("JPG전체").add(new TestFile("already.JPG", 300, 10)));

    const plan = await buildJpgPrepPlan(root as unknown as FileSystemDirectoryHandle, {
      includeSubdirectories: true,
      preserveStructure: true,
    });

    expect(plan.rows.map((row) => row.name)).toEqual(["A.JPG"]);
    expect(plan.rawUntouched).toBe(0);
    expect(plan.hiddenExcluded).toBe(3);
  });

  it("recognizes the integrated destination as an invalid source root", () => {
    expect(isJpgIntegratedRoot("JPG전체")).toBe(true);
    expect(isJpgIntegratedRoot("촬영")).toBe(false);
  });

  it("skips identical destinations and reports different contents as conflicts", async () => {
    const root = new TestDirectory("촬영")
      .add(new TestFile("same.jpg", 100, 5))
      .add(new TestFile("different.jpg", 200, 5));
    root.add(new TestDirectory("JPG전체")
      .add(new TestFile("same.jpg", 100, 5))
      .add(new TestFile("different.jpg", 201, 5)));

    const plan = await buildJpgPrepPlan(root as unknown as FileSystemDirectoryHandle, {
      includeSubdirectories: true,
      preserveStructure: true,
    });

    expect(plan.rows.find((row) => row.name === "same.jpg")?.status).toBe("skip");
    expect(plan.rows.find((row) => row.name === "different.jpg")?.status).toBe("conflict");
  });

  it("calls moveFileFast only with JPG plan rows and documents RAW as untouched", () => {
    const source = readFileSync(new URL("../components/photo-workspace/PhotoJpgPrepWorkspace.tsx", import.meta.url), "utf8");
    expect(source).toContain("moveFileFast({ src: row.fileHandle");
    expect(source).toContain("RAW_PHOTO_EXTENSIONS.has(fileExtension)");
    expect(source).not.toMatch(/moveFileFast\([\s\S]*?RAW_PHOTO_EXTENSIONS/);
  });
});
