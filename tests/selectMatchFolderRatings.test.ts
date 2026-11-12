import { describe, expect, it } from "vitest";

import {
  collectRatedBasenames,
  collectRatingsByName,
  mergeSharedRatings,
} from "@/lib/selectMatch/folderRatings";
import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";

function makeGroups(): SelectMatchFolderGroup[] {
  return [{
    name: "JPG",
    relativeDirectory: "",
    dirHandle: {} as FileSystemDirectoryHandle,
    photos: [
      {
        name: "_AK_0001.JPG",
        basename: "_AK_0001",
        handle: {} as FileSystemFileHandle,
        relativePath: "_AK_0001.JPG",
        thumbUrl: null,
        rating: null,
      },
      {
        name: "_AK_0002.JPG",
        basename: "_AK_0002",
        handle: {} as FileSystemFileHandle,
        relativePath: "_AK_0002.JPG",
        thumbUrl: null,
        rating: 3,
      },
    ],
  }];
}

describe("select match folder ratings", () => {
  it("merges shared ratings without mutating the scanned groups", () => {
    const groups = makeGroups();
    const merged = mergeSharedRatings(groups, { "_ak_0001": 5 });

    expect(merged[0]?.photos.map((photo) => photo.rating)).toEqual([5, 3]);
    expect(groups[0]?.photos.map((photo) => photo.rating)).toEqual([null, 3]);
  });

  it("collects ratings and basenames using the same minimum rule", () => {
    const groups = mergeSharedRatings(makeGroups(), { "_ak_0001": 5 });

    expect(collectRatingsByName(groups)).toEqual({
      "_AK_0001.JPG": 5,
      "_AK_0002.JPG": 3,
    });
    expect([...collectRatedBasenames(groups, 4)]).toEqual(["_ak_0001"]);
  });
});
