import { describe, expect, it } from "vitest";

import { pendingUploadPaths, uploadFileIdempotencyKey, uploadJobStatusFromCounts } from "@/lib/person-select/uploadQueue";

describe("person-select persistent upload queue", () => {
  it("does not collapse same basenames from different relative paths", () => {
    const one = uploadFileIdempotencyKey({ relativePath: "Scene 1/IMG_0001.JPG", size: 1234, lastModified: 99 });
    const two = uploadFileIdempotencyKey({ relativePath: "Scene 2/IMG_0001.JPG", size: 1234, lastModified: 99 });
    expect(one).not.toBe(two);
    expect(one).toBe(uploadFileIdempotencyKey({ relativePath: "Scene 1/IMG_0001.JPG", size: 1234, lastModified: 99 }));
  });

  it("resumes only unfinished paths and reports terminal states accurately", () => {
    const files = [{ relativePath: "a.jpg" }, { relativePath: "b.jpg" }, { relativePath: "c.jpg" }];
    expect(pendingUploadPaths(files, ["a.jpg", "c.jpg"])).toEqual([{ relativePath: "b.jpg" }]);
    expect(uploadJobStatusFromCounts({ total: 3, completed: 3, failed: 0, pending: 0, active: 0 })).toBe("completed");
    expect(uploadJobStatusFromCounts({ total: 3, completed: 2, failed: 1, pending: 0, active: 0 })).toBe("partial_failed");
    expect(uploadJobStatusFromCounts({ total: 2, completed: 0, failed: 2, pending: 0, active: 0 })).toBe("failed");
    expect(uploadJobStatusFromCounts({ total: 3, completed: 1, failed: 0, pending: 2, active: 0, paused: true })).toBe("paused");
  });
});
