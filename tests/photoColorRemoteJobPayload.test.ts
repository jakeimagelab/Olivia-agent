import { describe, expect, it } from "vitest";

import { clonePhotoEditRecipe } from "@/lib/photo-edit";
import { normalizeRemoteJobRequestPayload } from "@/lib/remote-jobs/requestPayload";

describe("photo color remote job payloads", () => {
  it("normalizes a folder color match without an event id", () => {
    expect(normalizeRemoteJobRequestPayload("PHOTO_COLOR_MATCH", {
      source_path: "root-1/보정본",
      options: { brightness: true, skin_tone: false },
      reference: { mode: "median" },
      selected_file_names: ["곽정호/A.JPG", "곽정호/A.JPG", "B.JPG"],
    })).toEqual({
      source_path: "root-1/보정본",
      options: { brightness: true, skin_tone: false },
      reference: { mode: "median" },
      selected_file_names: ["곽정호/A.JPG", "B.JPG"],
    });
  });

  it("requires a reference file only for reference mode", () => {
    expect(() => normalizeRemoteJobRequestPayload("PHOTO_COLOR_MATCH", {
      source_path: "root-1/보정본",
      options: { brightness: true, skin_tone: true },
      reference: { mode: "reference" },
    })).toThrow("기준 사진");
  });

  it("normalizes folder render recipes without an event id", () => {
    expect(normalizeRemoteJobRequestPayload("PHOTO_COLOR_RENDER", {
      output_path: "root-1/보정본_색맞춤",
      changes: [{ relativePath: "곽정호/A.JPG", recipe: clonePhotoEditRecipe() }],
    })).toMatchObject({
      output_path: "root-1/보정본_색맞춤",
      changes: [{ relativePath: "곽정호/A.JPG" }],
    });
  });

  it("rejects traversal in selected files", () => {
    expect(() => normalizeRemoteJobRequestPayload("PHOTO_COLOR_MATCH", {
      source_path: "root-1/보정본",
      selected_file_names: ["../A.JPG"],
    })).toThrow("선택 사진 경로");
  });
});
