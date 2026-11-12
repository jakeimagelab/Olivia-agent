import { describe, expect, it } from "vitest";

import {
  isRemoteWorkFolderReady,
  remoteWorkFolderStateFromResult,
} from "@/components/photo-classifier/useRemoteWorkFolderCheck";

const NEW_WORK_FOLDER = {
  sourceFolder: "root-0/촬영",
  workFolder: "Agentstation/촬영",
  jpgWorkFolder: "Agentstation/촬영/JPG전체",
  jpgWorkFolderExists: false,
};

describe("remote work folder check state", () => {
  it("distinguishes a new work folder from a resumable one", () => {
    expect(remoteWorkFolderStateFromResult(NEW_WORK_FOLDER).status).toBe("available");
    expect(remoteWorkFolderStateFromResult({ ...NEW_WORK_FOLDER, jpgWorkFolderExists: true }).status).toBe("resume");
  });

  it("is ready only for the currently selected source folder", () => {
    const state = remoteWorkFolderStateFromResult(NEW_WORK_FOLDER);
    expect(isRemoteWorkFolderReady(state, "root-0/촬영")).toBe(true);
    expect(isRemoteWorkFolderReady(state, "root-0/다른촬영")).toBe(false);
    expect(isRemoteWorkFolderReady({ status: "checking", sourceFolder: "root-0/촬영" }, "root-0/촬영")).toBe(false);
  });
});
