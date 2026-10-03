import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  authorizeWorker,
  getConfiguredWorkerId,
  isKnownWorkerId,
  listConfiguredWorkerIds,
} from "@/lib/remoteWorkerAuth";

function request(workerId: string, token: string) {
  return new NextRequest("http://localhost/api/worker/next", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-olivia-worker": workerId,
    },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("remote worker authentication", () => {
  it("keeps the existing single-worker environment compatible", () => {
    vi.stubEnv("OLIVIA_WORKER_ID", "legacy-worker");
    vi.stubEnv("OLIVIA_WORKER_IDS", "");
    vi.stubEnv("OLIVIA_WORKER_TOKEN", "shared-secret");

    expect(getConfiguredWorkerId()).toBe("legacy-worker");
    expect(listConfiguredWorkerIds()).toEqual(["legacy-worker"]);
    expect(authorizeWorker(request("legacy-worker", "shared-secret"))).toBe("legacy-worker");
  });

  it("authenticates configured workers with worker-specific tokens", () => {
    vi.stubEnv("OLIVIA_WORKER_ID", "jake-macstudio-01");
    vi.stubEnv("OLIVIA_WORKER_IDS", "jake-macstudio-01,jake-macbookpro-01");
    vi.stubEnv("OLIVIA_WORKER_TOKEN", "shared-secret");
    vi.stubEnv("OLIVIA_WORKER_TOKENS_JSON", JSON.stringify({ "jake-macbookpro-01": "macbook-secret" }));

    expect(isKnownWorkerId("jake-macbookpro-01")).toBe(true);
    expect(authorizeWorker(request("jake-macbookpro-01", "macbook-secret"))).toBe("jake-macbookpro-01");
    expect(authorizeWorker(request("jake-macbookpro-01", "shared-secret"))).toBeNull();
  });

  it("rejects unknown ids and invalid tokens", () => {
    vi.stubEnv("OLIVIA_WORKER_IDS", "jake-macstudio-01,jake-macbookpro-01");
    vi.stubEnv("OLIVIA_WORKER_TOKEN", "shared-secret");

    expect(authorizeWorker(request("unknown-worker", "shared-secret"))).toBeNull();
    expect(authorizeWorker(request("jake-macstudio-01", "wrong-secret"))).toBeNull();
  });
});
