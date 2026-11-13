import { describe, expect, it } from "vitest";

import {
  createPersonSelectUploadRuntime,
  personSelectUploadManifest,
  resumablePersonSelectUploadPaths,
} from "@/lib/person-select/uploadRuntime";
import type { LocalPersonSelectCandidate, LocalPersonSelectScan } from "@/lib/person-select/localImportRecords";

function candidate(relativePath: string, size: number, lastModified: number): LocalPersonSelectCandidate {
  const file = { size, lastModified } as File;
  return {
    file,
    relativePath,
    fileName: relativePath.split("/").at(-1) ?? relativePath,
    category: "photo",
    ownerName: "김고객",
    ownerGroup: null,
  };
}

describe("person select upload runtime", () => {
  it("creates stable manifests and indexes the runtime once", () => {
    const files = [candidate("김고객/A.JPG", 100, 10), candidate("김고객/B.JPG", 200, 20)];
    const scan: LocalPersonSelectScan = { files, skippedFolders: [], groupFolders: [], unnamedFolders: [], emptyFolders: [] };
    const manifest = personSelectUploadManifest(scan);
    const runtime = createPersonSelectUploadRuntime({
      eventId: "event-1",
      layout: "person-folders",
      files,
      queue: ["김고객/B.JPG"],
    });

    expect(manifest[0].idempotencyKey).toMatch(/^psu_/);
    expect(runtime.files.get("김고객/A.JPG")).toBe(files[0]);
    expect(runtime.sortOrderByPath.get("김고객/B.JPG")).toBe(1);
    expect(runtime.queue).toEqual(["김고객/B.JPG"]);
  });

  it("resumes only unfinished files whose size and modified time still match", () => {
    const files = [candidate("A.JPG", 100, 10), candidate("B.JPG", 200, 20)];
    const runtime = createPersonSelectUploadRuntime({ eventId: "event-1", layout: "project", files, queue: [] });
    const rows = [
      { relative_path: "A.JPG", file_size: 100, last_modified: 10, status: "failed" },
      { relative_path: "B.JPG", file_size: 999, last_modified: 20, status: "pending" },
      { relative_path: "C.JPG", file_size: 300, last_modified: 30, status: "uploading" },
      { relative_path: "B.JPG", file_size: 200, last_modified: 20, status: "completed" },
    ];

    expect(resumablePersonSelectUploadPaths(rows, runtime.files)).toEqual(["A.JPG"]);
  });
});
