import { describe, expect, it, vi } from "vitest";
import {
  createRemoteWorkerNasDataSource,
  mapRemoteWorkerFolderResult,
  RemoteNasDataSourceError,
} from "@/lib/remote-nas/remoteNasDataSource";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Remote Worker NAS data source", () => {
  it("creates LIST_FOLDER, polls the job, and preserves an NFD raw path", async () => {
    const rawFolderName = "0819_진보형교수님".normalize("NFD");
    const rawEntryName = "진료실_현장".normalize("NFD");
    const rawEntryPath = `${rawFolderName}/${rawEntryName}`;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "LIST_FOLDER", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "LIST_FOLDER", status: "RUNNING" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: {
          id: "018e2f30-92af-78b1-8f21-67f4404f5027",
          action: "LIST_FOLDER",
          status: "COMPLETED",
          result: {
            ok: true,
            root: "Workstation(M.2SSD)",
            path: rawFolderName,
            displayPath: "0819_진보형교수님",
            entries: [{
              name: rawEntryName,
              type: "folder",
              path: rawEntryPath,
              displayPath: "0819_진보형교수님/진료실_현장",
              size: null,
              modifiedAt: "2026-08-19T23:50:13",
            }],
          },
        },
      }));
    const source = createRemoteWorkerNasDataSource({ fetcher, pollIntervalMs: 0 });

    const result = await source.listFolder(rawFolderName);

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      action: "LIST_FOLDER",
      payload: { remote_path: rawFolderName },
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/remote-jobs?id=018e2f30-92af-78b1-8f21-67f4404f5027");
    expect(result.connection).toEqual({ macStudio: "online", nas: "connected", source: "worker" });
    expect(result.entries[0]?.path).toBe(rawEntryPath);
    expect(result.entries[0]?.displayName).toBe("진료실_현장");
    expect(result.entries[0]?.path).not.toBe(result.entries[0]?.displayPath);
  });

  it("stops before creating a job when already aborted", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const source = createRemoteWorkerNasDataSource({ fetcher });
    const controller = new AbortController();
    controller.abort();

    await expect(source.listFolder("", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces a Worker failure with online/unknown connection state", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: { id: "018e2f30-92af-78b1-8f21-67f4404f5027", action: "LIST_FOLDER", status: "QUEUED" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        job: {
          id: "018e2f30-92af-78b1-8f21-67f4404f5027",
          action: "LIST_FOLDER",
          status: "FAILED",
          error: "NAS가 연결되어 있지 않습니다.",
        },
      }));
    const source = createRemoteWorkerNasDataSource({ fetcher, pollIntervalMs: 0 });

    const promise = source.listFolder("");
    await expect(promise).rejects.toBeInstanceOf(RemoteNasDataSourceError);
    await expect(promise).rejects.toMatchObject({
      message: "NAS가 연결되어 있지 않습니다.",
      connection: { macStudio: "online", nas: "unknown", source: "worker" },
    });
  });

  it("filters system entries and rejects a different root", () => {
    const mapped = mapRemoteWorkerFolderResult({
      ok: true,
      root: "Workstation(M.2SSD)",
      path: "",
      entries: [
        { name: ".DS_Store", type: "file", path: ".DS_Store" },
        { name: "#recycle", type: "folder", path: "#recycle" },
        { name: "촬영", type: "folder", path: "촬영" },
      ],
    }, "");
    expect(mapped.entries.map((entry) => entry.displayName)).toEqual(["촬영"]);

    expect(() => mapRemoteWorkerFolderResult({
      ok: true,
      root: "AnotherShare",
      path: "",
      entries: [],
    }, "")).toThrow("허용되지 않은 NAS Root");
  });
});
