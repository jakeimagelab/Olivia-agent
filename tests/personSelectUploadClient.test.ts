import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPersonSelectUploadJob,
  loadPersonSelectUploadJobs,
  updatePersonSelectUploadJob,
} from "@/lib/person-select/uploadClient";

afterEach(() => vi.unstubAllGlobals());

describe("person select upload client", () => {
  it("treats a failed polling response as unavailable without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    await expect(loadPersonSelectUploadJobs()).resolves.toBeNull();
  });

  it("returns the persisted job from a checkpoint update", async () => {
    const job = { id: "job-1", event_id: "event-1", status: "paused" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, job })));

    await expect(updatePersonSelectUploadJob(job as never, { action: "pause" })).resolves.toEqual(job);
  });

  it("keeps completed paths when creating a resumable job", async () => {
    const job = { id: "job-1", event_id: "event-1", status: "queued" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, job, completedPaths: ["A.JPG"] })));

    const result = await createPersonSelectUploadJob({ eventId: "event-1", layout: "project", sourceName: "촬영", files: [] });
    expect(result).toEqual({ job, completedPaths: ["A.JPG"] });
  });
});
