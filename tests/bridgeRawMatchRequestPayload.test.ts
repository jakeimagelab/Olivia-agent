import { describe, expect, it } from "vitest";

import { buildRemoteBridgeRawMatchPayload } from "@/components/photo-workspace/RemoteBridgeRawMatchWorkspace";
import { normalizeBridgeRawMatchRequestPayload } from "@/lib/remote-jobs/bridgeRawMatchRequestPayload";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

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

  it("accepts a local selection that copies RAW only from a selected NAS folder", () => {
    const normalized = normalizeBridgeRawMatchRequestPayload({
      projectRoot: {
        projectKey: "root-1/1116_프로젝트",
        folderName: "1116_프로젝트",
        relativePath: "root-1/1116_프로젝트",
        kind: "raw",
      },
      selectedJpgs: [{
        name: "A.JPG",
        relativePath: "도수치료/A.JPG",
        size: 1234,
        captureTimeMs: 1_799_999_999_000,
      }],
      moveJpgs: false,
      openOutput: true,
    });
    expect(normalized).toMatchObject({
      projectRoot: { folderName: "1116_프로젝트", relativePath: "root-1/1116_프로젝트" },
      moveJpgs: false,
      selectedJpgs: [{ relativePath: "도수치료/A.JPG" }],
    });
    expect(normalized).not.toHaveProperty("currentJpgDirectory");
    expect(normalized).not.toHaveProperty("deliveredFolderName");
  });

  it("rejects a string moveJpgs value instead of changing modes implicitly", () => {
    expect(() => normalizeBridgeRawMatchRequestPayload({
      moveJpgs: "false",
      projectRoot: { projectKey: "root-0/project", folderName: "project", kind: "raw" },
      selectedJpgs: [{ name: "A.JPG", relativePath: "A.JPG", size: 10, captureTimeMs: null }],
    })).toThrow("moveJpgs는 boolean이어야 합니다");
  });

  it("builds a RAW-only payload from local JPG metadata and the exact NAS selection", () => {
    const jpg = {
      id: "local-a",
      name: "A.JPG",
      relativeDirectory: "도수치료",
      relativePath: "도수치료/A.JPG",
      extension: "JPG",
      size: 1234,
      lastModified: 1,
      captureTimestamp: 1_799_999_999_000,
      timestampSource: "datetime_original",
    } satisfies BridgeJpgFile;
    expect(buildRemoteBridgeRawMatchPayload({
      path: "root-1/1116_프로젝트",
      displayPath: "Agentstation(M.2SSD)/1116_프로젝트",
      rootName: "PERSON_SELECT_ROOTS",
    }, [jpg], { rawOnly: true })).toMatchObject({
      projectRoot: {
        folderName: "1116_프로젝트",
        relativePath: "root-1/1116_프로젝트",
      },
      selectedJpgs: [{ name: "A.JPG", relativePath: "도수치료/A.JPG", size: 1234 }],
      moveJpgs: false,
      openOutput: true,
    });
  });
});
