import { describe, expect, it } from "vitest";

import {
  checkFileSequence,
  defaultWorkerFolderPath,
  parseFileNameQueries,
  relativeToDirectoryRoot,
} from "@/lib/selectMatch/workspaceHelpers";
import { normalizeRecognizedFileNames } from "@/components/photo-workspace/useSelectMatchClientInput";

describe("select match workspace helpers", () => {
  it("normalizes and de-duplicates OCR file names", () => {
    expect(normalizeRecognizedFileNames([" _AK_0001.JPG ", "_ak_0001.jpg", "", "Á.JPG"])).toEqual([
      "_ak_0001.jpg",
      "á.jpg",
    ]);
  });

  it("normalizes and de-duplicates file name queries", () => {
    expect(parseFileNameQueries("_AK_0177.CR2, _ak_0177.cr2\n_AK_0200")).toEqual([
      { raw: "_AK_0177.CR2", basenameLower: "_ak_0177", extLower: "cr2" },
      { raw: "_AK_0200", basenameLower: "_ak_0200", extLower: null },
    ]);
  });

  it("builds worker and directory-relative paths", () => {
    expect(defaultWorkerFolderPath("Agentstation / 촬영 / JPG전체", "")).toBe("/Volumes/Agentstation/촬영/JPG전체");
    expect(defaultWorkerFolderPath("", "촬영")).toBe("/Volumes/촬영");
    expect(relativeToDirectoryRoot("촬영/JPG전체/_AK_0177.JPG", "촬영")).toBe("JPG전체/_AK_0177.JPG");
  });

  it("groups missing file number ranges and ignores duplicates", () => {
    expect(checkFileSequence([
      "_AK_0001.JPG",
      "_AK_0002.JPG",
      "copy_0002.JPG",
      "_AK_0005.JPG",
      "README.txt",
    ])).toMatchObject({
      totalFiles: 5,
      recognizedNumbers: [1, 2, 5],
      missingRanges: [{ start: 3, end: 4 }],
      min: 1,
      max: 5,
      rangeTooLarge: false,
    });
  });

  it("does not walk an abnormally large numeric range", () => {
    expect(checkFileSequence(["A_0001.JPG", "A_999999.JPG"])).toMatchObject({
      missingRanges: [],
      rangeTooLarge: true,
    });
  });
});
