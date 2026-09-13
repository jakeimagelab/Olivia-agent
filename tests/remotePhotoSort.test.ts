import { describe, expect, it, vi } from "vitest";
import { runRemotePhotoSort } from "@/lib/photo-classifier/remotePhotoSort";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const baseInput = {
  source_folder: "0819_진보형교수님".normalize("NFD"),
  shooting_mode: "field" as const,
  department: "rehabilitation",
  gap_minutes: 3.5,
  classification_ui_mode: "ai-auto" as const,
  fast_analyze_mode: false,
  department_logic_enabled: true,
  ai_naming_enabled: true,
  quality_analysis_enabled: false,
  profile_classification_enabled: true,
};

describe("remote photo sorting", () => {
  it("creates PHOTO_SORT with the raw NFD path and polls to completion", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_SORT", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_SORT", status: "RUNNING" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: {
          id: "018e2f30-92af-78b1-8f21-67f4404f5027",
          action: "PHOTO_SORT",
          status: "COMPLETED",
          result: { mode: "SIMULATED" },
        },
      }));
    const statuses: string[] = [];

    const result = await runRemotePhotoSort(baseInput, {
      fetcher,
      pollIntervalMs: 0,
      onJob: (job) => statuses.push(job.status),
    });

    const posted = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(posted.action).toBe("PHOTO_SORT");
    expect(posted.payload.source_folder).toBe(baseInput.source_folder);
    expect(posted.payload.source_folder).not.toBe(baseInput.source_folder.normalize("NFC"));
    expect(statuses).toEqual(["QUEUED", "RUNNING", "COMPLETED"]);
    expect(result.status).toBe("COMPLETED");
  });

  it("does not create a root-level sorting job", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(runRemotePhotoSort({ ...baseInput, source_folder: "" }, { fetcher }))
      .rejects.toThrow("NAS Root가 아닌 촬영 폴더");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops polling when aborted", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_SORT", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_SORT", status: "RUNNING" },
      }));

    await expect(runRemotePhotoSort(baseInput, {
      fetcher,
      pollIntervalMs: 10_000,
      signal: controller.signal,
      onJob: (job) => {
        if (job.status === "RUNNING") controller.abort();
      },
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});
