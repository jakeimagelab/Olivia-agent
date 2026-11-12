import { describe, expect, it } from "vitest";
import {
  buildPersonSelectFolderManifest,
  decodePersonSelectImageCursor,
  paginatePersonSelectImageRows,
  PERSON_SELECT_IMAGE_PAGE_SIZE,
  type PersonSelectImageMetadataRow,
} from "../lib/person-select/imagePaging";

function image(index: number, path = `C1/IMG_${String(index).padStart(4, "0")}.JPG`): PersonSelectImageMetadataRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    original_file_name: path.split("/").at(-1) ?? "",
    source_rel_path: path,
    sort_order: index,
  };
}

describe("person-select image metadata paging", () => {
  it("builds an NFC folder manifest and excludes delivered rounds", () => {
    const manifest = buildPersonSelectFolderManifest([
      image(1, "C1/A.JPG"),
      image(2, "C1/Detail/B.JPG"),
      image(3, "C2/C.JPG"),
      image(4, "root.JPG"),
      image(5, "C1/1차보정본/D.JPG"),
      image(6, "가/E.JPG"),
    ]);

    expect(manifest.totalCount).toBe(5);
    expect(manifest.rootPhotoCount).toBe(1);
    expect(manifest.folders.map((folder) => ({ path: folder.path, direct: folder.directCount, total: folder.totalCount }))).toEqual([
      { path: "C1", direct: 1, total: 2 },
      { path: "C1/Detail", direct: 1, total: 1 },
      { path: "C2", direct: 1, total: 1 },
      { path: "가", direct: 1, total: 1 },
    ]);
  });

  it("walks 2,500 rows by cursor without omissions or duplicates", () => {
    const rows = Array.from({ length: 2_500 }, (_, index) => image(index + 1));
    const visited: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: PersonSelectImageMetadataRow[]; nextCursor: string | null; totalCount: number } = paginatePersonSelectImageRows(rows, { location: "all", cursor });
      expect(page.items.length).toBeLessThanOrEqual(PERSON_SELECT_IMAGE_PAGE_SIZE);
      visited.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(visited).toHaveLength(2_500);
    expect(new Set(visited)).toHaveLength(2_500);
    expect(visited).toEqual(rows.map((row) => row.id));
  });

  it("keeps direct-folder and filename search semantics", () => {
    const rows = [
      image(1, "C1/_AK_1745.JPG"),
      image(2, "C1/Detail/_AK_1802.JPG"),
      image(3, "C1/_AK_2210.JPG"),
      image(4, "C2/_AK_1802.JPG"),
    ];
    const page = paginatePersonSelectImageRows(rows, {
      location: "folder",
      folderPath: "C1",
      search: "1745 1802",
    });
    expect(page.items.map((item) => item.original_file_name)).toEqual(["_AK_1745.JPG"]);
    expect(page.totalCount).toBe(1);
  });

  it("rejects malformed cursors instead of restarting from page one", () => {
    expect(decodePersonSelectImageCursor("not-a-cursor")).toBeNull();
    expect(() => paginatePersonSelectImageRows([image(1)], { location: "all", cursor: "not-a-cursor" })).toThrow("올바르지");
  });
});
