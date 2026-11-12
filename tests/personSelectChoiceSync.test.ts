import { describe, expect, it } from "vitest";
import { overlayPersonChoiceDiffs, type PersonSelectChoice, type PersonSelectImageData } from "@/components/person-select/usePersonChoiceSync";
import { splitSelectionSyncPatches } from "@/lib/person-select/selectionSync";

const images: PersonSelectImageData[] = [{
  id: "image-a",
  original_file_name: "A.JPG",
  thumb_url: "thumb-a",
  preview_url: "preview-a",
  width: 1200,
  height: 800,
}];

describe("person choice optimistic display", () => {
  it("shows a newly selected photo before the server response", () => {
    const diffs = splitSelectionSyncPatches([{ imageId: "image-a", selected: true }], 1, "2026-11-12T10:00:00.000Z").diffs;
    const displayed = overlayPersonChoiceDiffs(new Map(), diffs, images);

    expect(displayed.get("image-a")).toMatchObject({
      image_id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
    });
  });

  it("hides a cleared photo before the server response", () => {
    const selected: PersonSelectChoice = {
      id: "choice-a",
      image_id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
      retouch_keys: [],
      memo: "",
      updated_at: "2026-11-12T09:00:00.000Z",
    };
    const diffs = splitSelectionSyncPatches([{ imageId: "image-a", selected: false }], 1, "2026-11-12T10:00:00.000Z").diffs;
    const displayed = overlayPersonChoiceDiffs(new Map([[selected.image_id, selected]]), diffs, images);

    expect(displayed.has("image-a")).toBe(false);
  });
});
