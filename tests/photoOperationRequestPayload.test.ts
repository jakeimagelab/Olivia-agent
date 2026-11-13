import { describe, expect, it } from "vitest";
import { normalizePhotoOperationRequestPayload } from "@/lib/remote-jobs/photoOperationRequestPayload";

const projectId = "018e2f30-92af-78b1-8f21-67f4404f5027";
const selectionId = "018e2f30-92af-78b1-8f21-67f4404f5028";
const projectPath = "촬영/푸른안과";

describe("project photo operation payloads", () => {
  it("normalizes source preparation and same-path JPG staging", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_PREPARE_SOURCE", {
      project_id: projectId,
      source_relative_path: projectPath,
    })).toEqual({ project_id: projectId, source_relative_path: projectPath });

    expect(normalizePhotoOperationRequestPayload("PHOTO_STAGE_JPG", {
      project_id: projectId,
      source_relative_path: projectPath,
      destination_relative_path: projectPath,
    })).toEqual({
      project_id: projectId,
      source_relative_path: projectPath,
      destination_relative_path: projectPath,
    });
    expect(() => normalizePhotoOperationRequestPayload("PHOTO_STAGE_JPG", {
      project_id: projectId,
      source_relative_path: projectPath,
      destination_relative_path: "촬영/다른프로젝트",
    })).toThrow("동일한 프로젝트 경로");
  });

  it("keeps supported classification settings and drops unknown values", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_CLASSIFY_WORK", {
      project_id: projectId,
      work_relative_path: projectPath,
      department: "안과",
      gap_minutes: 8,
      classification_ui_mode: "advanced",
      fast_analyze_mode: true,
      unknown: "drop",
    })).toEqual({
      project_id: projectId,
      work_relative_path: projectPath,
      department: "안과",
      gap_minutes: 8,
      classification_ui_mode: "advanced",
      fast_analyze_mode: true,
    });
  });

  it("normalizes RAW matching names and optional selection id", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_RAW_MATCH", {
      project_id: projectId,
      project_relative_path: projectPath,
      selected_file_names: [" A.JPG ", "B.JPG"],
      selection_id: selectionId,
    })).toEqual({
      project_id: projectId,
      project_relative_path: projectPath,
      selected_file_names: ["A.JPG", "B.JPG"],
      selection_id: selectionId,
    });
  });

  it("applies resize defaults and validates optional settings", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_RESIZE", {
      project_id: projectId,
      project_relative_path: projectPath,
    })).toEqual({
      project_id: projectId,
      project_relative_path: projectPath,
      input_relative_path: "씬별분류",
    });
    expect(normalizePhotoOperationRequestPayload("PHOTO_RESIZE", {
      project_id: projectId,
      project_relative_path: projectPath,
      input_relative_path: "씬별분류/프로필",
      long_edge: 2000,
      quality: 85,
    })).toMatchObject({ input_relative_path: "씬별분류/프로필", long_edge: 2000, quality: 85 });
    expect(() => normalizePhotoOperationRequestPayload("PHOTO_RESIZE", {
      project_id: projectId,
      project_relative_path: projectPath,
      quality: 101,
    })).toThrow("quality");
  });

  it("validates AI selection flags and thresholds", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_AI_SELECT", {
      project_id: projectId,
      project_relative_path: projectPath,
      quality_filter: true,
      dup_removal: false,
      blur_threshold: 100,
      dark_threshold: 20,
    })).toMatchObject({
      quality_filter: true,
      dup_removal: false,
      blur_threshold: 100,
      dark_threshold: 20,
    });
    expect(() => normalizePhotoOperationRequestPayload("PHOTO_AI_SELECT", {
      project_id: projectId,
      project_relative_path: projectPath,
      quality_filter: "yes",
    })).toThrow("boolean");
  });

  it("limits retouch filenames and defaults its check type", () => {
    expect(normalizePhotoOperationRequestPayload("PHOTO_RETOUCH", {
      project_id: projectId,
      project_relative_path: projectPath,
      file_names: ["A.JPG"],
    })).toEqual({
      project_id: projectId,
      project_relative_path: projectPath,
      file_names: ["A.JPG"],
      check_type: "skin",
    });
  });

  it("rejects invalid project ids and ignores unrelated actions", () => {
    expect(() => normalizePhotoOperationRequestPayload("PHOTO_RESIZE", {
      project_id: "bad-id",
      project_relative_path: projectPath,
    })).toThrow("project_id");
    expect(normalizePhotoOperationRequestPayload("LIST_FOLDER", {})).toBeNull();
  });
});
