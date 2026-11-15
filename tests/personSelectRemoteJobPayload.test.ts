import { describe, expect, it } from "vitest";
import { normalizePersonSelectRequestPayload } from "@/lib/remote-jobs/personSelectRequestPayload";
import { clonePhotoEditRecipe } from "@/lib/photo-edit";

const eventId = "018e2f30-92af-78b1-8f21-67f4404f5027";
const reviewerId = "018e2f30-92af-78b1-8f21-67f4404f5028";

describe("person-select remote job payloads", () => {
  it("normalizes color match and render jobs", () => {
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_COLOR_MATCH", {
      event_id: eventId,
      source_relative_path: "root-1/보정본",
      brightness: true,
      skin_tone: true,
      target_mode: "median",
    })).toEqual({ event_id: eventId, source_relative_path: "root-1/보정본", brightness: true, skin_tone: true, target_mode: "median" });
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_COLOR_RENDER", {
      event_id: eventId,
      output_relative_path: "root-1/보정본_색맞춤",
      changes: [{ relativePath: "김원장/A.JPG", recipe: clonePhotoEditRecipe() }],
    })).toMatchObject({ event_id: eventId, output_relative_path: "root-1/보정본_색맞춤" });
  });

  it.each(["person-folders", "project"] as const)("keeps the %s import contract", (layout) => {
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_IMPORT", {
      event_id: eventId,
      source_relative_path: "root-0/푸른안과/JPG전체",
      layout,
    })).toEqual({
      event_id: eventId,
      source_relative_path: "root-0/푸른안과/JPG전체",
      layout,
    });
  });

  it("keeps school imports mapped and rejects missing mappings", () => {
    const mappings = [{ folder: "프로필", category: "프로필", owner: "person" }];
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_IMPORT", {
      event_id: eventId,
      source_relative_path: "root-0/학교전달",
      layout: "school",
      mappings,
    })).toMatchObject({ mappings });
    expect(() => normalizePersonSelectRequestPayload("PERSON_SELECT_IMPORT", {
      event_id: eventId,
      source_relative_path: "root-0/학교전달",
      layout: "school",
    })).toThrow("가져오기 항목 매핑");
  });

  it("defaults RAW matching to submitted copy and deduplicates reviewers", () => {
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_RAW_MATCH", {
      event_id: eventId,
      reviewerIds: [reviewerId, reviewerId],
    })).toEqual({
      event_id: eventId,
      mode: "copy",
      source: "submitted",
      reviewerIds: [reviewerId],
    });
  });

  it("allows clearing marks only in mark mode", () => {
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_RAW_MATCH", {
      event_id: eventId,
      mode: "mark",
      source: "current",
      clear_mark: true,
      labelNames: { 6: "Select", 7: "Second", 8: "Approved", 9: "Review" },
    })).toMatchObject({ mode: "mark", source: "current", clear_mark: true });
    expect(() => normalizePersonSelectRequestPayload("PERSON_SELECT_RAW_MATCH", {
      event_id: eventId,
      mode: "copy",
      clear_mark: true,
    })).toThrow("mark 모드");
  });

  it("normalizes the person-select folder root contract", () => {
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_LIST_FOLDER", {})).toEqual({ root: true });
    expect(normalizePersonSelectRequestPayload("PERSON_SELECT_LIST_FOLDER", {
      remote_path: "root-0/푸른안과",
      folders_only: true,
    })).toEqual({ remote_path: "root-0/푸른안과", folders_only: true });
    expect(() => normalizePersonSelectRequestPayload("PERSON_SELECT_LIST_FOLDER", {
      root: true,
      remote_path: "root-0/푸른안과",
    })).toThrow("동시에 지정");
  });

  it("returns null for another worker action", () => {
    expect(normalizePersonSelectRequestPayload("PHOTO_SORT", {})).toBeNull();
  });
});
