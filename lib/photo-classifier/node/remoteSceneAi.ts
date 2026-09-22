import type { PhotoSceneAnalysisOutput } from "@/lib/ai/openai";
import type { analyzePhotoScene } from "@/lib/photo-classifier/server/sceneAi";

const REMOTE_SCENE_TIMEOUT_MS = 70_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function remoteConfig(): { baseUrl: string; token: string; workerId: string; bypass?: string } {
  const baseUrl = (process.env.REMOTE_API_BASE || process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.OLIVIA_WORKER_TOKEN || process.env.WORKER_TOKEN || "").trim();
  const workerId = (process.env.OLIVIA_WORKER_ID || process.env.WORKER_ID || "jake-macstudio-01").trim();
  const bypass = process.env.VERCEL_BYPASS_SECRET?.trim();
  if (!baseUrl || !token || !workerId) {
    throw new Error("원격 Scene 분석 서버 설정이 없습니다.");
  }
  return { baseUrl, token, workerId, ...(bypass ? { bypass } : {}) };
}

function parseAnalysis(value: unknown): PhotoSceneAnalysisOutput {
  const analysis = record(value);
  const requiredStrings = ["department", "sceneId", "sceneType", "displayName", "suggestedFolderName", "reason"] as const;
  for (const key of requiredStrings) {
    if (typeof analysis[key] !== "string") throw new Error(`Scene 분석 응답의 ${key} 값이 올바르지 않습니다.`);
  }
  if (typeof analysis.confidence !== "number" || !Number.isFinite(analysis.confidence)) {
    throw new Error("Scene 분석 응답의 confidence 값이 올바르지 않습니다.");
  }
  return analysis as unknown as PhotoSceneAnalysisOutput;
}

/** Mac Studio에는 provider secret을 두지 않고 인증된 Olivia 서버의 기존 Scene AI를 사용한다. */
export const analyzePhotoSceneRemotely: typeof analyzePhotoScene = async (input) => {
  const config = remoteConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_SCENE_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/api/worker/photo-scene-analysis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "x-olivia-worker": config.workerId,
        ...(config.bypass ? { "x-vercel-protection-bypass": config.bypass } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = record(await response.json().catch(() => ({})));
    if (!response.ok || body.ok !== true) {
      throw new Error(typeof body.error === "string" ? body.error : `원격 Scene 분석 실패 (${response.status})`);
    }
    return parseAnalysis(body.analysis);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("원격 Scene 분석 시간이 초과되었습니다.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
