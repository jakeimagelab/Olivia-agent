import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ authorized: true }));
const analyzeSceneMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/remoteWorkerAuth", () => ({
  isAuthorizedWorker: () => state.authorized,
}));

vi.mock("@/lib/photo-classifier/brain/hermesPhotoBrain", () => ({
  hermesPhotoBrain: { analyzeScene: analyzeSceneMock },
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/worker/photo-scene-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.authorized = true;
  analyzeSceneMock.mockReset();
});

describe("POST /api/worker/photo-scene-analysis", () => {
  it("rejects a request without worker authentication", async () => {
    state.authorized = false;
    const { POST } = await import("@/app/api/worker/photo-scene-analysis/route");
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(analyzeSceneMock).not.toHaveBeenCalled();
  });

  it("passes at most six validated representative images to the Hermes scene brain", async () => {
    analyzeSceneMock.mockResolvedValue({
      department: "dermatology", sceneId: "01_기타", sceneType: "treatment", displayName: "시술",
      suggestedFolderName: "시술", confidence: 0.93, detectedCues: ["핸드피스"], negativeCues: [],
      reason: "시술 장면", needsReview: false, patientPosture: "lying_down", hasHandpiece: true,
      hasTreatmentDevice: true, hasTreatmentBed: true, hasConsultationDesk: false,
    });
    const images = Array.from({ length: 6 }, (_, index) => ({ fileName: `A00${index}.JPG`, base64: "data:image/jpeg;base64,AAAA" }));
    const { POST } = await import("@/app/api/worker/photo-scene-analysis/route");
    const response = await POST(request({ department: "dermatology", sceneId: "01_기타", images }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, analysis: { sceneType: "treatment", suggestedFolderName: "시술" } });
    expect(analyzeSceneMock).toHaveBeenCalledWith(expect.objectContaining({ department: "dermatology", sceneId: "01_기타", images }));
  });

  it("rejects more than six representative images before provider execution", async () => {
    const images = Array.from({ length: 7 }, (_, index) => ({ fileName: `A00${index}.JPG`, base64: "AAAA" }));
    const { POST } = await import("@/app/api/worker/photo-scene-analysis/route");
    const response = await POST(request({ department: "dermatology", sceneId: "01_기타", images }));
    expect(response.status).toBe(400);
    expect(analyzeSceneMock).not.toHaveBeenCalled();
  });
});
