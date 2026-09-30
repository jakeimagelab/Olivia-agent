import { describe, expect, it } from "vitest";
import {
  buildCustomPrefixFilename,
  buildParentPrefixFilename,
  buildTemplateFilename,
} from "@/lib/photoRename/naming";
import { buildRenamePlan, type RenameSettings } from "@/lib/photoRename/renamePlan";

function notFound(name: string): Error {
  return Object.assign(new Error(`${name} not found`), { name: "NotFoundError" });
}

class FileHandleStub {
  readonly kind = "file" as const;
  constructor(readonly name: string) {}
}

class DirectoryHandleStub {
  readonly kind = "directory" as const;
  readonly children = new Map<string, FileHandleStub | DirectoryHandleStub>();
  constructor(readonly name: string) {}
  file(name: string) { this.children.set(name, new FileHandleStub(name)); return this; }
  directory(name: string) { const child = new DirectoryHandleStub(name); this.children.set(name, child); return child; }
  async *entries(): AsyncGenerator<[string, FileSystemHandle]> {
    for (const entry of this.children) yield entry as [string, FileSystemHandle];
  }
  async getFileHandle(name: string) {
    const child = this.children.get(name);
    if (!child || child.kind !== "file") throw notFound(name);
    return child as unknown as FileSystemFileHandle;
  }
}

const base = (overrides: Partial<RenameSettings> = {}): RenameSettings => ({
  mode: "parent-prefix",
  template: { text: "0921_entob_", startNumber: 213, digits: 3 },
  customText: "서공예_증명",
  includeSubdirectories: true,
  transferMode: "same-folder",
  ...overrides,
});

describe("photo rename filename rules", () => {
  it("adds only the direct parent folder name", () => {
    expect(buildParentPrefixFilename("증명_1반_1_김규리", "[260415]서공예22099.jpg"))
      .toBe("증명_1반_1_김규리_[260415]서공예22099.jpg");
  });

  it("does not create a double underscore for a user prefix ending in underscore", () => {
    expect(buildCustomPrefixFilename("서공예_", "IMG_001.jpg")).toBe("서공예_IMG_001.jpg");
  });

  it("keeps source extensions and assigns a stable template sequence", () => {
    expect(buildTemplateFilename("_AK_8060.JPG", base().template, 0)).toBe("0921_entob_213.JPG");
    expect(buildTemplateFilename("_AK_8061.JPG", base().template, 2)).toBe("0921_entob_215.JPG");
  });
});

describe("photo rename preflight", () => {
  it("skips a file whose own parent prefix was already applied", async () => {
    const root = new DirectoryHandleStub("증명_1반");
    root.directory("증명_1반_1_김규리").file("증명_1반_1_김규리_[260415]서공예22099.jpg");
    const plan = await buildRenamePlan({ root: root as unknown as FileSystemDirectoryHandle, destination: null, settings: base() });
    expect(plan.skipCount).toBe(1);
    expect(plan.rows[0]).toMatchObject({ status: "SKIP" });
  });

  it("uses every file's direct parent across many student folders", async () => {
    const root = new DirectoryHandleStub("증명_1반");
    for (let index = 1; index <= 38; index += 1) root.directory(`증명_1반_${index}_학생`).file(`IMG_${index}.JPG`);
    const plan = await buildRenamePlan({ root: root as unknown as FileSystemDirectoryHandle, destination: null, settings: base() });
    expect(plan.readyCount).toBe(38);
    expect(plan.rows.find((row) => row.name === "IMG_1.JPG")?.targetName).toBe("증명_1반_1_학생_IMG_1.JPG");
    expect(plan.rows.find((row) => row.name === "IMG_38.JPG")?.targetName).toBe("증명_1반_38_학생_IMG_38.JPG");
  });

  it("preserves Korean, spaces, and brackets in a prefixed original filename", async () => {
    const root = new DirectoryHandleStub("증명사진");
    root.file("[260415] 서공예 22099.jpg");
    const plan = await buildRenamePlan({ root: root as unknown as FileSystemDirectoryHandle, destination: null, settings: base({ mode: "custom-prefix", customText: "서공예_증명" }) });
    expect(plan.rows[0].targetName).toBe("서공예_증명_[260415] 서공예 22099.jpg");
  });

  it("uses natural source-name order for both preview and sequence output", async () => {
    const root = new DirectoryHandleStub("촬영");
    root.file("IMG_10.JPG").file("IMG_2.JPG").file("IMG_1.JPG");
    const plan = await buildRenamePlan({ root: root as unknown as FileSystemDirectoryHandle, destination: null, settings: base({ mode: "template" }) });
    expect(plan.rows.map((row) => [row.name, row.targetName])).toEqual([
      ["IMG_1.JPG", "0921_entob_213.JPG"],
      ["IMG_2.JPG", "0921_entob_214.JPG"],
      ["IMG_10.JPG", "0921_entob_215.JPG"],
    ]);
  });

  it("marks an existing destination filename as duplicate and blocks execution", async () => {
    const root = new DirectoryHandleStub("촬영");
    root.file("IMG_1.JPG").file("촬영_IMG_1.JPG");
    const plan = await buildRenamePlan({ root: root as unknown as FileSystemDirectoryHandle, destination: null, settings: base({ mode: "parent-prefix" }) });
    expect(plan.rows.find((row) => row.name === "IMG_1.JPG")).toMatchObject({ status: "DUPLICATE" });
    expect(plan.blocked).toBe(true);
  });
});
