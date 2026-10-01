import { describe, expect, it, vi } from "vitest";
import { checkRemotePhotoWorkFolder } from "@/lib/photo-classifier/remotePhotoWorkFolderCheck";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("remote photo work-folder check", () => {
  it("checks the selected NAS folder's exact Agentstation work path without starting a sort", async () => {
    const sourceFolder = "0927_BLS_TEST".normalize("NFD");
    const workFolder = `/Volumes/Agentstation(M.2SSD)/${sourceFolder}`;
    const jpgWorkFolder = `${workFolder}/JPG전체`;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_CHECK_WORK_FOLDER", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: {
          id: "018e2f30-92af-78b1-8f21-67f4404f5027",
          action: "PHOTO_CHECK_WORK_FOLDER",
          status: "COMPLETED",
          result: { sourceFolder, workFolder, jpgWorkFolder, jpgWorkFolderExists: true },
        },
      }));

    await expect(checkRemotePhotoWorkFolder(sourceFolder, { fetcher, pollIntervalMs: 0 }))
      .resolves.toEqual({ sourceFolder, workFolder, jpgWorkFolder, jpgWorkFolderExists: true });

    const posted = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(posted).toEqual({
      action: "PHOTO_CHECK_WORK_FOLDER",
      payload: { source_folder: sourceFolder },
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/api/remote-jobs?id=");
  });

  it("reports the Worker reason instead of claiming an unchecked folder is available", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "PHOTO_CHECK_WORK_FOLDER", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        job: {
          id: "018e2f30-92af-78b1-8f21-67f4404f5027",
          action: "PHOTO_CHECK_WORK_FOLDER",
          status: "FAILED",
          error: "Agentstation 볼륨에 접근할 수 없습니다.",
        },
      }));

    await expect(checkRemotePhotoWorkFolder("0927_BLS_TEST", { fetcher, pollIntervalMs: 0 }))
      .rejects.toThrow("Agentstation 볼륨에 접근할 수 없습니다.");
  });
});
