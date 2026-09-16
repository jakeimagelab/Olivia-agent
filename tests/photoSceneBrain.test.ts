import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneFrameAnalysis } from "@/lib/photo-classifier/hybrid-types";

function baseAnalysis(overrides: Partial<SceneFrameAnalysis> = {}): SceneFrameAnalysis {
  return {
    peopleCount: 2, hasDoctor: true, hasPatient: true, hasStaff: false,
    dominantPersonChanged: false, personChangeConfidence: 0,
    primaryClinicianChanged: false, primaryClinicianChangeConfidence: 0.1,
    locationType: "treatment_room", locationChanged: false, locationChangeConfidence: 0.1,
    roomChanged: false, roomChangeConfidence: 0.1,
    equipmentPresent: true, equipmentCategory: "laser_device", equipmentChanged: false, equipmentChangeConfidence: 0.1,
    primaryMedicalDeviceChanged: false, primaryMedicalDeviceChangeConfidence: 0.1,
    primaryMedicalDeviceIdBefore: "thermage_flx", primaryMedicalDeviceIdAfter: "thermage_flx",
    handpiecePresent: true, syringePresent: false, treatmentBedPresent: true, consultationDeskPresent: false,
    patientPose: "lying", beforePatientPose: "lying", afterPatientPose: "lying",
    shotDistance: "medium", beforeShotDistance: "medium", afterShotDistance: "closeup",
    sceneType: "treatment", beforeSceneType: "treatment", afterSceneType: "treatment",
    sceneTypeChanged: false, confidence: 0.9, reasons: ["같은 장비·공간에서 구도만 변경"],
    ...overrides,
  };
}

const analyzeBoundaryMock = vi.fn();
vi.mock("@/lib/photo-classifier/brain/localPhotoBrain", () => ({
  localPhotoBrain: {
    engine: "openai",
    analyzeBoundary: (...args: unknown[]) => analyzeBoundaryMock(...args),
    analyzeScene: vi.fn(),
    scanPurpose: vi.fn(),
    analyzeFolderPattern: vi.fn(),
  },
}));

describe("Olivia OS 2.0 — 사진분류 PhotoSceneBrain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    analyzeBoundaryMock.mockReset();
  });

  it("getPhotoClassificationEngine/resolvePhotoSceneBrain — 기본값은 local(OpenAI 직접), 플래그를 켜야 hermes", async () => {
    const { getPhotoClassificationEngine, resolvePhotoSceneBrain, localPhotoBrain, hermesPhotoBrain } = await import("@/lib/photo-classifier/brain");
    vi.unstubAllEnvs();
    expect(getPhotoClassificationEngine()).toBe("local");
    expect(resolvePhotoSceneBrain()).toBe(localPhotoBrain);
    vi.stubEnv("OLIVIA_PHOTO_HERMES_BRAIN", "1");
    expect(getPhotoClassificationEngine()).toBe("hermes");
    expect(resolvePhotoSceneBrain()).toBe(hermesPhotoBrain);
  });

  it("localPhotoBrain은 기존 sceneAi.ts 함수를 그대로 가리킨다(로직 재작성 없음)", async () => {
    const { localPhotoBrain } = await import("@/lib/photo-classifier/brain/localPhotoBrain");
    const sceneAi = await import("@/lib/photo-classifier/server/sceneAi");
    const folderPatternAi = await import("@/lib/photo-classifier/server/folderPatternAi");
    expect(localPhotoBrain.analyzeBoundary).toBe(sceneAi.analyzeSceneBoundary);
    expect(localPhotoBrain.analyzeScene).toBe(sceneAi.analyzePhotoScene);
    expect(localPhotoBrain.scanPurpose).toBe(sceneAi.scanScenePurposes);
    expect(localPhotoBrain.analyzeFolderPattern).toBe(folderPatternAi.analyzeFolderPattern);
  });

  it("확신도가 높은 관찰 결과는 Hermes를 호출하지 않는다(성능 예산 보호, §6)", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({ confidence: 0.92 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.confidence).toBe(0.92);
  });

  it("Hermes 설정이 없으면(연결 불가) Vision 관찰 결과를 그대로 폴백 사용한다(§9)", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({ confidence: 0.4 }));
    vi.unstubAllEnvs();
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(result.confidence).toBe(0.4);
    expect(result.primaryClinicianChanged).toBe(false);
  });

  it("Hermes가 응답 없이 실패해도(네트워크 오류) 분류가 죽지 않고 Vision 결과로 폴백한다(§9, §18)", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({ confidence: 0.5 }));
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("connection refused"); }));
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(result.confidence).toBe(0.5);
  });

  it("Hermes가 깨진 응답을 줘도 안전하게 Vision 결과로 폴백한다", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({ confidence: 0.5, primaryClinicianChanged: false }));
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    const garbage = new Response("data: {\"choices\":[{\"delta\":{\"content\":\"이건 JSON이 아니에요\"}}]}\n\ndata: [DONE]\n\n", { status: 200 });
    vi.stubGlobal("fetch", vi.fn(async () => garbage));
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(result.primaryClinicianChanged).toBe(false);
    expect(result.confidence).toBe(0.5);
  });

  it("Hermes가 유효한 보정 JSON을 주면 화이트리스트 필드만 반영하고 근거를 덧붙인다", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({
      confidence: 0.5, primaryClinicianChanged: true, primaryClinicianChangeConfidence: 0.6,
      reasons: ["인원 변화 감지"],
    }));
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    const refinement = JSON.stringify({ primaryClinicianChanged: false, confidence: 0.85, reasons: "보조 직원 등장일 뿐 주체 의료진은 동일" });
    const sse = new Response(`data: {"choices":[{"delta":{"content":${JSON.stringify(refinement)}}}]}\n\ndata: [DONE]\n\n`, { status: 200 });
    vi.stubGlobal("fetch", vi.fn(async () => sse));
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(result.primaryClinicianChanged).toBe(false);
    expect(result.confidence).toBe(0.85);
    expect(result.reasons).toContain("인원 변화 감지");
    expect(result.reasons.some((reason) => reason.includes("[Hermes]"))).toBe(true);
  });

  it("Hermes가 범위를 벗어난 값을 주면(예: confidence>1) 그 필드는 무시하고 원본을 유지한다", async () => {
    analyzeBoundaryMock.mockResolvedValue(baseAnalysis({ confidence: 0.5 }));
    vi.stubEnv("HERMES_BASE_URL", "http://100.89.79.55:8642");
    vi.stubEnv("HERMES_API_KEY", "secret");
    const refinement = JSON.stringify({ confidence: 42, primaryClinicianChanged: "yes" });
    const sse = new Response(`data: {"choices":[{"delta":{"content":${JSON.stringify(refinement)}}}]}\n\ndata: [DONE]\n\n`, { status: 200 });
    vi.stubGlobal("fetch", vi.fn(async () => sse));
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    const result = await hermesPhotoBrain.analyzeBoundary({ department: "dermatology", before: [], after: [], timeGapSeconds: 90 });
    expect(result.confidence).toBe(0.5); // out-of-range 값은 거부
    expect(result.primaryClinicianChanged).toBe(false); // 잘못된 타입("yes")도 거부
  });

  it("engine 식별자가 각 Brain 구현체마다 올바르게 설정돼 있다", async () => {
    const { localPhotoBrain } = await import("@/lib/photo-classifier/brain/localPhotoBrain");
    const { hermesPhotoBrain } = await import("@/lib/photo-classifier/brain/hermesPhotoBrain");
    expect(localPhotoBrain.engine).toBe("openai");
    expect(hermesPhotoBrain.engine).toBe("hermes");
  });
});
