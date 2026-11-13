import { describe, expect, it, vi } from "vitest";

import {
  executePersonSelectUploadPath,
  pumpPersonSelectUploadRuntime,
  type PersonSelectUploadExecutionDependencies,
} from "@/lib/person-select/uploadExecution";
import { createPersonSelectUploadRuntime } from "@/lib/person-select/uploadRuntime";
import type { LocalPersonSelectCandidate } from "@/lib/person-select/localImportRecords";

function candidate(relativePath: string): LocalPersonSelectCandidate {
  return {
    file: { size: 100, lastModified: 10 } as File,
    relativePath,
    fileName: relativePath.split("/").at(-1) ?? relativePath,
    category: "photo",
    ownerName: "김고객",
    ownerGroup: null,
  };
}

function dependencies(overrides: Partial<PersonSelectUploadExecutionDependencies> = {}) {
  return {
    checkpoint: vi.fn().mockResolvedValue(undefined),
    createDerivatives: vi.fn().mockResolvedValue({
      sourceWidth: 1600,
      sourceHeight: 1200,
      thumb: new Blob(["thumb"], { type: "image/jpeg" }),
      preview: new Blob(["preview"], { type: "image/jpeg" }),
    }),
    upload: vi.fn().mockResolvedValue(undefined),
    delay: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies PersonSelectUploadExecutionDependencies;
}

describe("person select upload execution", () => {
  it("uploads each queued path once and preserves its relative path", async () => {
    const files = [candidate("김고객/A.JPG"), candidate("김고객/B.JPG")];
    const runtime = createPersonSelectUploadRuntime({
      eventId: "event-1",
      layout: "person-folders",
      files,
      queue: files.map((file) => file.relativePath),
    });
    const deps = dependencies();

    await pumpPersonSelectUploadRuntime({ jobId: "job-1", runtime, dependencies: deps });

    expect(deps.upload).toHaveBeenCalledTimes(2);
    const forms = vi.mocked(deps.upload).mock.calls.map((call) => call[1]);
    expect(forms.map((form) => form.get("relativePath"))).toEqual(expect.arrayContaining(["김고객/A.JPG", "김고객/B.JPG"]));
    expect(runtime.queue).toEqual([]);
    expect(runtime.controllers.size).toBe(0);
  });

  it("keeps a paused path in the queue after derivative creation", async () => {
    const file = candidate("김고객/A.JPG");
    const runtime = createPersonSelectUploadRuntime({ eventId: "event-1", layout: "person-folders", files: [file], queue: [] });
    const deps = dependencies({
      createDerivatives: vi.fn().mockImplementation(async () => {
        runtime.paused = true;
        return { sourceWidth: 10, sourceHeight: 10, thumb: new Blob(), preview: new Blob() };
      }),
    });

    await executePersonSelectUploadPath({ jobId: "job-1", runtime, relativePath: file.relativePath, dependencies: deps });

    expect(runtime.queue).toEqual([file.relativePath]);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("retries transient failures and records a terminal file failure", async () => {
    const file = candidate("김고객/A.JPG");
    const runtime = createPersonSelectUploadRuntime({ eventId: "event-1", layout: "person-folders", files: [file], queue: [file.relativePath] });
    const deps = dependencies({ upload: vi.fn().mockRejectedValue(new Error("network down")) });

    await pumpPersonSelectUploadRuntime({ jobId: "job-1", runtime, dependencies: deps, options: { concurrency: 1, maxRetries: 1 } });

    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(deps.delay).toHaveBeenCalledWith(350);
    expect(deps.checkpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "file_failed",
      relativePath: file.relativePath,
      attempts: 2,
      error: "network down",
    }));
    expect(runtime.queue).toEqual([]);
  });

  it("requeues a file when its failure checkpoint cannot be saved", async () => {
    const file = candidate("김고객/A.JPG");
    const runtime = createPersonSelectUploadRuntime({ eventId: "event-1", layout: "person-folders", files: [file], queue: [] });
    const onDeferredCheckpoint = vi.fn();
    const checkpoint = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("checkpoint unavailable"));
    const deps = dependencies({
      checkpoint,
      upload: vi.fn().mockRejectedValue(new Error("upload failed")),
      onDeferredCheckpoint,
    });

    await executePersonSelectUploadPath({
      jobId: "job-1",
      runtime,
      relativePath: file.relativePath,
      dependencies: deps,
      maxRetries: 0,
    });

    expect(runtime.queue).toEqual([file.relativePath]);
    expect(onDeferredCheckpoint).toHaveBeenCalledWith("failure", expect.any(Error));
  });
});
