import { describe, expect, it } from "vitest";
import { normalizePhotoBrowseRequestPayload } from "@/lib/remote-jobs/photoBrowseRequestPayload";

describe("photo browsing remote job payloads", () => {
  it("uses an explicit root payload without redundant fields", () => {
    expect(normalizePhotoBrowseRequestPayload("LIST_FOLDER", {
      root: true,
      folders_only: true,
    })).toEqual({ root: true, folders_only: true });
    expect(normalizePhotoBrowseRequestPayload("LIST_FOLDER", { remote_path: null })).toEqual({ root: true });
  });

  it("preserves safe NFD folder paths and rejects traversal", () => {
    const nfdPath = "0911_촬영/원본";
    expect(normalizePhotoBrowseRequestPayload("LIST_FOLDER", { remote_path: nfdPath })).toEqual({
      remote_path: nfdPath,
    });
    expect(() => normalizePhotoBrowseRequestPayload("LIST_FOLDER", {
      remote_path: "../outside",
    })).toThrow();
  });

  it("keeps PHOTO_SORT options but strips check-folder extras", () => {
    expect(normalizePhotoBrowseRequestPayload("PHOTO_SORT", {
      source_folder: "촬영/프로젝트",
      mode: "fast",
    })).toEqual({ source_folder: "촬영/프로젝트", mode: "fast" });
    expect(normalizePhotoBrowseRequestPayload("PHOTO_CHECK_WORK_FOLDER", {
      source_folder: "촬영/프로젝트",
      mode: "ignored",
    })).toEqual({ source_folder: "촬영/프로젝트" });
  });

  it("applies thumbnail paging defaults and limits", () => {
    expect(normalizePhotoBrowseRequestPayload("PHOTO_THUMBS", {
      remote_path: "촬영/프로젝트",
    })).toEqual({ remote_path: "촬영/프로젝트", max_count: 400, offset: 0 });
    expect(normalizePhotoBrowseRequestPayload("PHOTO_THUMBS", {
      remote_path: "촬영/프로젝트",
      max_count: 120,
      offset: 240,
    })).toEqual({ remote_path: "촬영/프로젝트", max_count: 120, offset: 240 });
    expect(() => normalizePhotoBrowseRequestPayload("PHOTO_THUMBS", {
      remote_path: "촬영/프로젝트",
      max_count: 401,
    })).toThrow("max_count");
  });

  it("normalizes XMP rating paths and ignores unrelated actions", () => {
    expect(normalizePhotoBrowseRequestPayload("PHOTO_XMP_RATINGS", {
      remote_path: "촬영/프로젝트",
    })).toEqual({ remote_path: "촬영/프로젝트" });
    expect(normalizePhotoBrowseRequestPayload("PERSON_SELECT_RAW_MATCH", {})).toBeNull();
  });
});
