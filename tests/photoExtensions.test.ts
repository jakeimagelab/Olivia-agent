import { describe, expect, it } from "vitest";
import {
  CAMERA_JPG_EXTENSIONS,
  RAW_PHOTO_EXTENSIONS,
  SELECTABLE_IMAGE_EXTENSIONS,
} from "@/lib/photo/extensions";
import {
  JPG_PHOTO_EXTENSIONS,
  RAW_PHOTO_EXTENSIONS as CLASSIFIER_RAW_EXTENSIONS,
} from "@/lib/photo-classifier/constants";
import { SELECT_MATCH_JPG_EXTENSIONS } from "@/lib/selectMatch/folderScanner";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

describe("photo extension sets", () => {
  it("keeps camera RAW extensions in one source", () => {
    expect([...RAW_PHOTO_EXTENSIONS]).toEqual(["arw", "cr3", "cr2", "nef", "raf", "dng", "orf", "rw2"]);
    expect(CLASSIFIER_RAW_EXTENSIONS).toBe(RAW_PHOTO_EXTENSIONS);
    expect(SELECT_MATCH_RAW_EXTENSIONS).toBe(RAW_PHOTO_EXTENSIONS);
  });

  it("separates camera JPG files from selectable images", () => {
    expect([...CAMERA_JPG_EXTENSIONS]).toEqual(["jpg", "jpeg"]);
    expect([...SELECTABLE_IMAGE_EXTENSIONS]).toEqual(["jpg", "jpeg", "heic", "heif", "tif", "tiff", "webp", "png"]);
    expect(JPG_PHOTO_EXTENSIONS).toBe(CAMERA_JPG_EXTENSIONS);
    expect(SELECT_MATCH_JPG_EXTENSIONS).toBe(SELECTABLE_IMAGE_EXTENSIONS);
  });
});
