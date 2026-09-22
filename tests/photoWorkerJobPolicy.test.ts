import { describe, expect, it } from "vitest";
import { applyPhotoWorkerJobPolicy } from "@/lib/photo-classifier/workerJobPolicy";

describe("photo worker job delivery policy", () => {
  it("enables representative-frame naming for every classification job", () => {
    expect(applyPhotoWorkerJobPolicy({
      action: "PHOTO_CLASSIFY_WORK",
      payload: {
        project_id: "project-1",
        ai_naming_enabled: false,
        profile_classification_enabled: true,
      },
    })).toEqual({
      project_id: "project-1",
      ai_naming_enabled: true,
      profile_classification_enabled: false,
    });
  });

  it("does not alter non-classification jobs", () => {
    const payload = { project_id: "project-1", source_relative_path: "0922_test_os" };

    expect(applyPhotoWorkerJobPolicy({
      action: "PHOTO_STAGE_JPG",
      payload,
    })).toEqual(payload);
  });

  it("normalizes missing payloads without failing worker polling", () => {
    expect(applyPhotoWorkerJobPolicy({ action: "PING" })).toEqual({});
  });
});
