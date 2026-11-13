import { describe, expect, it } from "vitest";
import { photoSortingFolderActivation } from "@/components/photo-classifier/usePhotoSortingSourceActions";

describe("photo sorting source actions", () => {
  it("opens a local picker once on the primary pointer event", () => {
    expect(photoSortingFolderActivation("LOCAL_DIRECT", { kind: "pointer", button: 0 })).toBe("local");
    expect(photoSortingFolderActivation("LOCAL_DIRECT", { kind: "click", detail: 1 })).toBeNull();
    expect(photoSortingFolderActivation("LOCAL_DIRECT", { kind: "pointer", button: 2 })).toBeNull();
  });

  it("keeps keyboard activation for a local folder button", () => {
    expect(photoSortingFolderActivation("LOCAL_DIRECT", { kind: "click", detail: 0 })).toBe("local");
  });

  it("opens the remote picker from click without handling pointer-down twice", () => {
    expect(photoSortingFolderActivation("REMOTE_WORKER", { kind: "pointer", button: 0 })).toBeNull();
    expect(photoSortingFolderActivation("REMOTE_WORKER", { kind: "click", detail: 1 })).toBe("remote");
  });
});
