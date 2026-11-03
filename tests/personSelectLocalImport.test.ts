import { describe, expect, it } from "vitest";
import { deriveLocalImportRecord, scanLocalPersonSelectFiles, type LocalPersonSelectSource } from "@/lib/person-select/localImport";

function source(relativePath: string): LocalPersonSelectSource {
  return { file: { name: relativePath.split("/").at(-1) } as File, relativePath };
}

describe("person select local folder scan", () => {
  it("uses the preferred JPG folder and reports group, unnamed and empty folders", () => {
    const result = scanLocalPersonSelectFiles([
      source("김춘자/R5K_0000.JPG"),
      source("김춘자/JPG원본/R5K_0001.JPG"),
      source("이지영/DSC_0002.jpg"),
      source("그룹1/JPG원본/R5K_0100.JPG"),
      source("개인3/JPG원본/R5K_0200.JPG"),
      source("김춘자/R5K_0001.CR3"),
    ], "person-folders", ["김춘자", "이지영", "그룹1", "개인3", "박빈칸", "Selected_RAW"]);

    expect(result.files.map((file) => [file.ownerName, file.relativePath, file.category])).toEqual([
      ["김춘자", "김춘자/JPG원본/R5K_0001.JPG", "photo"],
      ["이지영", "이지영/DSC_0002.jpg", "photo"],
    ]);
    expect(result.groupFolders).toEqual(["그룹1"]);
    expect(result.unnamedFolders).toEqual(["개인3"]);
    expect(result.emptyFolders).toEqual(["박빈칸"]);
  });

  it("reads only mapped school folders and derives people and groups", () => {
    const result = scanLocalPersonSelectFiles([
      source("선생님프로필/선생님프로필_고가연/A.JPG"),
      source("담임선생님/담임선생님_3반선생님/B.jpg"),
      source("학생사진/학생_가연/C.JPG"),
    ], "school", ["선생님프로필", "담임선생님", "학생사진"]);

    expect(result.files.map((file) => [file.ownerName, file.ownerGroup, file.category, file.relativePath])).toEqual([
      [null, "3반", "homeroom", "담임선생님/담임선생님_3반선생님/B.jpg"],
      ["고가연", null, "profile", "선생님프로필/선생님프로필_고가연/A.JPG"],
    ]);
    expect(result.skippedFolders).toEqual(["학생사진"]);
  });

  it("normalizes NFC and rejects traversal, hidden paths and unsupported nesting", () => {
    const nfd = "김춘자".normalize("NFD");
    expect(deriveLocalImportRecord("person-folders", `${nfd}/JPG원본/A.JPG`)).toMatchObject({ ownerName: "김춘자", relativePath: "김춘자/JPG원본/A.JPG" });
    expect(deriveLocalImportRecord("person-folders", "../김춘자/A.JPG")).toBeNull();
    expect(deriveLocalImportRecord("person-folders", "김춘자/.숨김/A.JPG")).toBeNull();
    expect(deriveLocalImportRecord("person-folders", "김춘자/RAW/A.JPG")).toBeNull();
    expect(deriveLocalImportRecord("school", "학생사진/학생_가연/A.JPG")).toBeNull();
  });
});
