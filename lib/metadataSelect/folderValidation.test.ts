import { describe, expect, it } from "vitest";
import { validateMetadataSelectFolders } from "@/lib/metadataSelect/folderValidation";
import { FINISHED_RAW_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";

class DirectoryHandleStub {
  readonly kind = "directory" as const;

  constructor(public readonly name: string) {}

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this;
  }

  async resolve(): Promise<string[] | null> {
    return null;
  }
}

const directory = (name: string) => new DirectoryHandleStub(name) as unknown as FileSystemDirectoryHandle;

describe("validateMetadataSelectFolders", () => {
  it("원본 JPG 없이 선택본과 RAW 원본만으로 진행할 수 있다", async () => {
    await expect(validateMetadataSelectFolders({
      selectionDir: directory("선택본"),
      sourceDir: null,
      rawDir: directory("RAW 원본"),
    })).resolves.toBeUndefined();
  });

  it("Finished_RAW 자체를 RAW 원본으로 선택하지 못하게 한다", async () => {
    await expect(validateMetadataSelectFolders({
      selectionDir: directory("선택본"),
      sourceDir: null,
      rawDir: directory(FINISHED_RAW_DIRECTORY),
    })).rejects.toThrow("Finished_RAW");
  });

  it("선택본과 RAW 원본이 같은 폴더면 중단한다", async () => {
    const same = directory("같은 폴더");
    await expect(validateMetadataSelectFolders({
      selectionDir: same,
      sourceDir: null,
      rawDir: same,
    })).rejects.toThrow("같습니다");
  });
});
