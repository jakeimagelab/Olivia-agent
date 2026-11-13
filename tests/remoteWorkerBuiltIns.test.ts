import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkerBuiltIn } from "@/lib/remote-jobs/node/workerBuiltIns";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.OLIVIA_WORKER_STATE_DIR;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Mac Studio worker built-ins", () => {
  it("returns the supplied worker identity for PING", async () => {
    await expect(executeWorkerBuiltIn(
      { action: "PING", payload: {} },
      { workerId: "jake-macstudio-01" },
    )).resolves.toMatchObject({ ok: true, status: "PONG", workerId: "jake-macstudio-01" });
  });

  it("performs COPY_TEST inside the configured state directory and cleans markers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "olivia-worker-built-in-"));
    temporaryDirectories.push(root);
    process.env.OLIVIA_WORKER_STATE_DIR = root;

    await expect(executeWorkerBuiltIn(
      { action: "COPY_TEST", payload: {} },
      { workerId: "jake-macstudio-01" },
    )).resolves.toMatchObject({ ok: true, status: "COPY_TEST_COMPLETED" });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects actions without a built-in implementation", async () => {
    await expect(executeWorkerBuiltIn(
      { action: "PHOTO_SORT", payload: {} },
      { workerId: "jake-macstudio-01" },
    )).rejects.toThrow("내장 실행기가 없는 action");
  });
});
