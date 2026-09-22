import { localPhotoBrain } from "./localPhotoBrain";
import type { PhotoSceneBrain } from "./types";
import type { SceneFrameAnalysis } from "@/lib/photo-classifier/hybrid-types";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { PhotoSceneAnalysisOutput } from "@/lib/ai/openai";

// Olivia OS 2.0 — 사진분류 AI를 Hermes Brain 중심 구조로 전환(요청서 §1/§2).
//
// 왜 lib/assistant/brain/hermesProvider.ts(runHermesChat)를 그대로 재사용하지 않는가:
// runHermesChat()은 requestId를 lib/hermes/executionContext.ts의 in-memory Map에 등록하고,
// Hermes가 그 requestId로 /api/hermes/mcp를 "같은 Next.js 서버 프로세스" 안에서 콜백하는 걸
// 전제로 한다(app/api/olivia/v2/stream/route.ts처럼 실행 중인 서버 프로세스 안에서 호출될 때만
// 유효). 이 사진 파이프라인(remotePhotoSortRunner.ts)은 Mac Studio에서 도는 독립 CLI
// worker 프로세스(scripts/photo-classify-work-runner.ts)로 실행되므로 그 전제가 성립하지
// 않는다 — 같은 방식을 그대로 쓰면 Hermes의 MCP 콜백이 엉뚱한(또는 존재하지 않는) 프로세스의
// in-memory context를 찾다가 조용히 실패한다.
//
// 그래서 여기서는 MCP tool-calling 왕복 없이, Vision Tool(기존 analyzeSceneBoundary,
// sceneAi.ts) 관찰 결과를 이미 확보한 뒤 그 결과를 prompt에 직접 넣어 Hermes에게 검토·보정을
// 요청하는 단순 chat completion만 사용한다. 상호작용형 Olivia 채팅(웹/텔레그램)에서 Hermes가
// 사진 분류를 물어보는 경로는 별도로 MCP Tool(photo_inspect_boundary 등)을 쓴다 — 그건
// OLIVIA_V2_TOOLS 쪽에 등록돼 있고 /api/olivia/v2/stream 프로세스 안에서 정상 동작한다.
const HERMES_PHOTO_TIMEOUT_MS = 20_000; // 대화형 chat(60s)보다 훨씬 짧다 — 배치 파이프라인 성능 예산 보호(요청서 §6).
const REVIEW_CONFIDENCE_THRESHOLD = 0.75; // 이보다 낮은 confidence만 Hermes 재검토 대상 — 확실한 건 코드/Vision이 그대로 담당(§3).

function getHermesConfig(): { baseUrl: string; apiKey: string; model: string } | null {
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.HERMES_API_SECRET?.trim() || process.env.HERMES_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, model: process.env.HERMES_MODEL?.trim() || "hermes-agent" };
}

/** runHermesChat()과 같은 SSE 파싱 방식이지만 MCP execution context/tool audit 의존이 없다. */
async function callHermesForJson(userPrompt: string): Promise<Record<string, unknown> | null> {
  const config = getHermesConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HERMES_PHOTO_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: [
          {
            role: "system",
            content: "당신은 병원 촬영 사진의 Scene 경계 관찰 결과를 검토하는 보조 판단자입니다. "
              + "이미 시각 분석(Vision Tool)이 만든 관찰 결과를 받아, 필요할 때만 특정 필드를 보정한 "
              + "JSON 객체로 응답하세요. 확신이 없으면 원본 값을 그대로 두고 빈 객체 {}를 반환하세요. "
              + "설명 문장 없이 JSON 객체 하나만 출력하세요.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";
    const handleBlock = (block: string) => {
      const line = block.split("\n").find((entry) => entry.startsWith("data:"));
      if (!line) return;
      const raw = line.slice(5).trimStart();
      if (!raw || raw === "[DONE]") return;
      try {
        const payload = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: unknown } }> };
        const content = payload.choices?.[0]?.delta?.content;
        if (typeof content === "string") finalText += content;
      } catch {
        // 손상된 SSE 청크는 건너뛴다 — 전체 실패로 취급하지 않는다.
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) handleBlock(buffer);
    if (!finalText.trim()) return null;
    const match = finalText.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) as Record<string, unknown> : null;
  } catch {
    return null; // 타임아웃/네트워크 실패는 조용히 null — 호출부가 Vision 관찰 결과로 폴백한다(§9).
  } finally {
    clearTimeout(timeout);
  }
}

function boundaryReviewPrompt(analysis: SceneFrameAnalysis, timeGapSeconds?: number): string {
  return `[Vision Tool 관찰 결과]\n${JSON.stringify(analysis, null, 2)}\n\n`
    + `촬영 공백: ${timeGapSeconds == null ? "알 수 없음" : `${timeGapSeconds.toFixed(1)}초`}\n\n`
    + `질문은 "사진이 달라 보이는가"가 아니라 "실제 촬영 Scene이 바뀌었는가"입니다.\n\n`
    + `[분리 신호 우선순위 — 위에서부터 순서대로만 판단 근거로 사용]\n`
    + `1. 주체 의료진 변경(보조 직원 등장/퇴장, 사람 수 변화는 제외)\n`
    + `2. 주요 의료장비/핸드피스 변경(같은 장비의 각도 변화는 제외)\n`
    + `3. 촬영목적 변경(상담↔시술↔프로필↔피부관리↔인테리어)\n`
    + `4. 실제 공간(방) 정체성 변경 — 벽·창문·고정 가구 등 고정 구조 자체가 다른 공간이라는\n`
    + `   근거가 있을 때만. Camera viewpoint changes are NOT room changes: 카메라 위치·각도·줌·\n`
    + `   크롭·거리·구도·밝기/노출·배경 구성만 달라 보이는 것으로는 roomChanged=true를 주지 마세요\n`
    + `   (Do not infer a room change from background composition alone).\n`
    + `[SAME_SCENE 우선 — 절대 분리 사유로 쓰지 말 것]\n`
    + `- 와이드↔클로즈업, 카메라 좌우 이동, 렌즈/거리/포즈/줌/크롭/구도 변경, 사람 수 변화,\n`
    + `  소도구/배경 구성/밝기·노출/환자 자세/촬영자 위치 변화\n`
    + `- 주체 의료진·주요 장비·촬영목적이 모두 동일하다면, 방이 확실히 바뀌었다는 근거가 없는 한\n`
    + `  SAME_SCENE 쪽으로 판단을 기울이세요.\n\n`
    + `위 관찰 결과의 confidence가 낮거나 애매합니다. 관찰 결과가 이 기준에 맞게 정확한지 검토하고, `
    + `고칠 값이 있으면 그 필드만 포함한 JSON을 반환하세요(예: {"primaryClinicianChanged": false, "confidence": 0.8, "reasons": ["보조 직원 변화일 뿐 주체 의료진은 동일"]}). `
    + `고칠 게 없으면 {}만 반환하세요.`;
}

/** Hermes가 반환한 보정값 중 안전하게 검증 가능한 필드만, 타입이 맞을 때만 반영한다. */
function applyBoundaryRefinement(base: SceneFrameAnalysis, refinement: Record<string, unknown> | null): { analysis: SceneFrameAnalysis; refined: boolean } {
  if (!refinement || Object.keys(refinement).length === 0) return { analysis: base, refined: false };
  const merged: SceneFrameAnalysis = { ...base };
  let refined = false;

  const applyBoolean = (key: "primaryClinicianChanged" | "roomChanged" | "primaryMedicalDeviceChanged" | "sceneTypeChanged") => {
    if (typeof refinement[key] === "boolean" && refinement[key] !== merged[key]) {
      merged[key] = refinement[key] as boolean;
      refined = true;
    }
  };
  const applyConfidence = (key: "primaryClinicianChangeConfidence" | "roomChangeConfidence" | "primaryMedicalDeviceChangeConfidence" | "confidence") => {
    const value = refinement[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
      merged[key] = value;
      refined = true;
    }
  };
  applyBoolean("primaryClinicianChanged");
  applyConfidence("primaryClinicianChangeConfidence");
  applyBoolean("roomChanged");
  applyConfidence("roomChangeConfidence");
  applyBoolean("primaryMedicalDeviceChanged");
  applyConfidence("primaryMedicalDeviceChangeConfidence");
  applyBoolean("sceneTypeChanged");
  applyConfidence("confidence");
  if (typeof refinement.reasons === "string") {
    merged.reasons = [...merged.reasons, `[Hermes] ${refinement.reasons}`];
    refined = true;
  } else if (Array.isArray(refinement.reasons) && refinement.reasons.every((entry) => typeof entry === "string")) {
    merged.reasons = [...merged.reasons, ...(refinement.reasons as string[]).map((entry) => `[Hermes] ${entry}`)];
    refined = true;
  }
  return { analysis: merged, refined };
}

/**
 * Hermes = 판단자, Vision(OpenAI) = 도구(요청서 §2).
 * 1. 기존 analyzeSceneBoundary()(Vision Tool, 변경 없음)를 그대로 호출해 관찰 결과를 얻는다.
 * 2. confidence가 낮은(애매한) 경우에만 Hermes에게 그 관찰 결과 + 고정 판단 기준을 보여주고
 *    보정할 필드가 있는지 묻는다 — 이미지 자체는 Hermes에게 보내지 않는다(§2, Hermes는 사진을
 *    직접 볼 수 없다는 전제).
 * 3. Hermes가 응답하지 않거나(타임아웃/장애) 파싱에 실패하면 Vision 관찰 결과를 그대로 쓴다 —
 *    분류 자체가 Hermes 장애로 실패하는 일은 없다(§9 fallback).
 * 4. 최종 split/merge/review 숫자 판단은 여전히 boundary-score.ts의 decideBoundary가 한다 —
 *    이 함수는 그 입력값(SceneFrameAnalysis)을 만들 뿐 최종 결정을 내리지 않는다.
 */
async function analyzeBoundaryWithHermes(input: Parameters<PhotoSceneBrain["analyzeBoundary"]>[0]): ReturnType<PhotoSceneBrain["analyzeBoundary"]> {
  const observation = await localPhotoBrain.analyzeBoundary(input);
  if (observation.confidence >= REVIEW_CONFIDENCE_THRESHOLD) return observation;
  const refinement = await callHermesForJson(boundaryReviewPrompt(observation, input.timeGapSeconds));
  return applyBoundaryRefinement(observation, refinement).analysis;
}

function sceneReviewPrompt(
  department: MedicalDepartment,
  observation: PhotoSceneAnalysisOutput,
): string {
  const config = getDepartmentConfig(department);
  const allowed = config.sceneTypes
    .map((rule) => `${rule.sceneType} (${rule.displayName}): ${rule.description}`)
    .join("\n");
  return `[Vision Tool의 Scene 대표컷 관찰 결과]\n${JSON.stringify(observation, null, 2)}\n\n`
    + `진료과: ${config.displayName}\n`
    + `허용된 Scene 타입:\n${allowed}\n\n`
    + `이 관찰 결과를 검토해 Scene 전체의 촬영 목적을 하나만 판정하세요. `
    + `세부 시술명이나 자유 형식 폴더명을 만들지 말고 위 sceneType 중 하나만 선택하세요. `
    + `대표컷 관찰만으로도 확실하지 않으면 etc를 유지하세요. `
    + `JSON 객체 {"sceneType":"treatment","confidence":0.9,"reason":"환자가 베드에 누워 핸드피스 시술 중"}만 반환하세요.`;
}

function applySceneRefinement(
  department: MedicalDepartment,
  base: PhotoSceneAnalysisOutput,
  refinement: Record<string, unknown> | null,
): PhotoSceneAnalysisOutput {
  if (!refinement) return base;
  const sceneType = typeof refinement.sceneType === "string" ? refinement.sceneType : "";
  const confidence = refinement.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0.75 || confidence > 1) {
    return base;
  }
  const rule = getDepartmentConfig(department).sceneTypes.find((candidate) => candidate.sceneType === sceneType);
  if (!rule) return base;
  const hermesReason = typeof refinement.reason === "string" ? refinement.reason.trim() : "";
  return {
    ...base,
    sceneType: rule.sceneType,
    displayName: rule.displayName,
    suggestedFolderName: rule.folderName,
    confidence,
    reason: hermesReason ? `${base.reason} · [Hermes] ${hermesReason}` : base.reason,
    needsReview: rule.sceneType === "etc",
  };
}

/**
 * Vision은 Scene 대표컷을 관찰하고 Hermes는 구조화된 관찰 결과만 최종 검토한다.
 * Hermes 장애/낮은 확신/허용되지 않은 타입은 모두 기존 Vision 결과로 폴백한다.
 */
async function analyzeSceneWithHermes(
  input: Parameters<PhotoSceneBrain["analyzeScene"]>[0],
): ReturnType<PhotoSceneBrain["analyzeScene"]> {
  const observation = await localPhotoBrain.analyzeScene(input);
  const refinement = await callHermesForJson(sceneReviewPrompt(input.department, observation));
  return applySceneRefinement(input.department, observation, refinement);
}

export const hermesPhotoBrain: PhotoSceneBrain = {
  engine: "hermes",
  analyzeBoundary: analyzeBoundaryWithHermes,
  // scanPurpose/analyzeFolderPattern은 배치당 호출 빈도가 낮고(폴더당 1회 수준) 아직 Hermes
  // 보정 로직을 연결하지 않았다 — 다음 단계로 남겨둔다(보고서 §12 참고). 지금은 Vision Tool
  // 그대로를 통과시켜 동작을 그대로 유지한다.
  scanPurpose: localPhotoBrain.scanPurpose,
  analyzeFolderPattern: localPhotoBrain.analyzeFolderPattern,
  analyzeScene: analyzeSceneWithHermes,
};
