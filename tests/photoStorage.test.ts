import { describe, expect, it } from "vitest";
import { eventForStatus, validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";

describe("photo storage server guards", () => {
  it("preserves raw relative paths, including unicode normalization form", () => {
    const nfd = "0914_강남성모안과".normalize("NFD");
    expect(validatePhotoProjectRelativePath(nfd)).toBe(nfd);
    expect(validatePhotoProjectRelativePath("0914_강남성모안과/JPG원본")).toBe("0914_강남성모안과/JPG원본");
  });

  it.each(["/Volumes/PHOTO_MAIN/shoot", "/Users/mac/shoot", "../shoot", "shoot/../other", "shoot\\other", "shoot//JPG"]) (
    "rejects unsafe source path %s",
    (value) => expect(() => validatePhotoProjectRelativePath(value)).toThrow(),
  );

  it("maps lifecycle statuses to stable event types", () => {
    expect(eventForStatus("READY")).toMatchObject({ type: "PHOTO_PROJECT_READY", requiresAction: true });
    expect(eventForStatus("APPROVED")).toMatchObject({ type: "PHOTO_PROJECT_APPROVED", requiresAction: false });
    expect(eventForStatus("DEFERRED")).toMatchObject({ type: "PHOTO_PROJECT_DEFERRED", requiresAction: false });
    expect(eventForStatus("REVIEW_REQUIRED")).toMatchObject({ type: "PHOTO_PROJECT_REVIEW_REQUIRED", requiresAction: true });
  });
});
