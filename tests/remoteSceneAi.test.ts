import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzePhotoSceneRemotely } from "@/lib/photo-classifier/node/remoteSceneAi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Mac Studio remote Scene analyzer", () => {
  it("uses worker authentication and returns the server analysis", async () => {
    vi.stubEnv("REMOTE_API_BASE", "https://olivia.example.com/");
    vi.stubEnv("OLIVIA_WORKER_TOKEN", "worker-secret");
    vi.stubEnv("OLIVIA_WORKER_ID", "worker-1");
    const analysis = {
      department: "dermatology", sceneId: "01_기타", sceneType: "treatment", displayName: "시술",
      suggestedFolderName: "시술", confidence: 0.92, detectedCues: [], negativeCues: [], reason: "시술",
      needsReview: false, patientPosture: "lying_down", hasHandpiece: true, hasTreatmentDevice: true,
      hasTreatmentBed: true, hasConsultationDesk: false,
    };
    const fetchMock = vi.fn(async () => Response.json({ ok: true, analysis }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzePhotoSceneRemotely({
      department: "dermatology",
      sceneId: "01_기타",
      images: [{ fileName: "A001.JPG", base64: "data:image/jpeg;base64,AAAA" }],
    });

    expect(result).toEqual(analysis);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://olivia.example.com/api/worker/photo-scene-analysis",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer worker-secret",
          "x-olivia-worker": "worker-1",
        }),
      }),
    );
  });

  it("fails clearly when worker configuration is missing", async () => {
    vi.stubEnv("REMOTE_API_BASE", "");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
    vi.stubEnv("OLIVIA_WORKER_TOKEN", "");
    vi.stubEnv("WORKER_TOKEN", "");

    await expect(analyzePhotoSceneRemotely({
      department: "dermatology", sceneId: "01_기타", images: [{ fileName: "A.JPG", base64: "AAAA" }],
    })).rejects.toThrow(/설정이 없습니다/);
  });
});
