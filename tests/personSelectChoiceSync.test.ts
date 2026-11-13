import { describe, expect, it } from "vitest";
import {
  overlayPersonChoiceDiffs,
  reconcilePersonChoiceMaps,
  type PersonSelectChoice,
  type PersonSelectImageData,
} from "@/lib/person-select/personChoiceSyncState";
import { personSelectPhotoTilePropsEqual } from "@/components/person-select/PersonSelectPhotoTile";
import { personSelectFilmstripThumbnailPropsEqual } from "@/components/person-select/PersonSelectFilmstripImages";
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

  it("does not rerender unchanged mobile photo tiles when another selection changes", () => {
    const onOpen = () => undefined;
    const previous = { image: images[0], selected: false, pending: false, onOpen };
    expect(personSelectPhotoTilePropsEqual(previous, { ...previous })).toBe(true);
    expect(personSelectPhotoTilePropsEqual(previous, { ...previous, selected: true })).toBe(false);
    expect(personSelectPhotoTilePropsEqual(previous, { ...previous, pending: true })).toBe(false);
  });

  it("does not rerender unchanged PC filmstrip thumbnails for a save status update", () => {
    const onSelect = () => undefined;
    const activeThumbRef = { current: null };
    const previous = {
      image: images[0],
      current: false,
      selected: false,
      pending: false,
      activeThumbRef,
      onSelect,
    };
    expect(personSelectFilmstripThumbnailPropsEqual(previous, { ...previous })).toBe(true);
    expect(personSelectFilmstripThumbnailPropsEqual(previous, { ...previous, pending: true })).toBe(false);
    expect(personSelectFilmstripThumbnailPropsEqual(previous, { ...previous, current: true })).toBe(false);
  });

  it("keeps the same choice map and item objects for an unchanged server refresh", () => {
    const current: PersonSelectChoice = {
      id: "choice-a",
      image_id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
      retouch_keys: ["skin"],
      memo: "자연스럽게",
      updated_at: "2026-11-12T09:00:00.000Z",
    };
    const refreshed = { ...current, retouch_keys: ["skin"], updated_at: "2026-11-12T10:00:00.000Z" };
    const previous = new Map([[current.image_id, current]]);
    const reconciled = reconcilePersonChoiceMaps(previous, new Map([[refreshed.image_id, refreshed]]));

    expect(reconciled).toBe(previous);
    expect(reconciled.get("image-a")).toBe(current);
  });

  it("replaces only a choice whose customer-visible value changed", () => {
    const current: PersonSelectChoice = {
      id: "choice-a",
      image_id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
      retouch_keys: [],
      memo: "",
      updated_at: "2026-11-12T09:00:00.000Z",
    };
    const changed = { ...current, memo: "안경 반사 제거" };
    const reconciled = reconcilePersonChoiceMaps(
      new Map([[current.image_id, current]]),
      new Map([[changed.image_id, changed]]),
    );

    expect(reconciled.get("image-a")).toBe(changed);
  });
});
