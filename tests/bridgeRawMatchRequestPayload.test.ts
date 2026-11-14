import { describe, expect, it } from "vitest";

import { normalizeBridgeRawMatchRequestPayload } from "@/lib/remote-jobs/bridgeRawMatchRequestPayload";

describe("PHOTO_BRIDGE_RAW_MATCH payload", () => {
  it("keeps only folder identity and selected JPG samples", () => {
    expect(normalizeBridgeRawMatchRequestPayload({
      projectRoot: {
        projectKey: "root-0/1114_서울예방치과교실/JPG전체/단체사진",
        folderName: "1114_서울예방치과교실",
        relativePath: "1114_서울예방치과교실",
        kind: "raw",
      },
      currentJpgDirectory: "JPG전체/단체사진",
      selectedJpgs: [{
        name: "_AK_4076.JPG",
        relativePath: "JPG전체/단체사진/_AK_4076.JPG",
        size: 1234,
        captureTimeMs: 1_799_999_999_000,
      }],
      deliveredFolderName: "1차보정본",
      openOutput: true,
    })).toMatchObject({
      projectRoot: { folderName: "1114_서울예방치과교실", kind: "raw" },
      currentJpgDirectory: "JPG전체/단체사진",
      selectedJpgs: [{ name: "_AK_4076.JPG", size: 1234 }],
      deliveredFolderName: "1차보정본",
      openOutput: true,
    });
  });

  it("rejects absolute paths and missing samples", () => {
    expect(() => normalizeBridgeRawMatchRequestPayload({
      projectRoot: { projectKey: "p", folderName: "촬영", kind: "raw" },
      currentJpgDirectory: "/Volumes/JPG전체",
      selectedJpgs: [],
      deliveredFolderName: "1차보정본",
    })).toThrow();
  });
});
