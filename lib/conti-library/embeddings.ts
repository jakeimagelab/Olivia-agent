import { EMBEDDING_MODEL } from "./config";
import type { ContiCaseScene, ExtractedCaseDocument, ExtractedCaseScene } from "./types";

// OPENAI_API_KEY가 없거나 호출이 실패하면 예외를 던지지 않고 null을 반환한다 — 호출부(특히
// /api/conti의 참고사례 조회)가 이 기능 없이도 기존처럼 동작해야 하기 때문이다.
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || texts.length === 0) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!response.ok) {
      console.error("[conti-library] 임베딩 생성 실패:", await response.text().catch(() => response.statusText));
      return null;
    }
    const data = await response.json();
    const embeddings = (data.data as { embedding: number[]; index: number }[] | undefined)
      ?.sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);
    return embeddings ?? null;
  } catch (error) {
    console.error("[conti-library] 임베딩 호출 예외:", error);
    return null;
  }
}

// 장면 임베딩 텍스트 — raw_text(추출 과정의 노이즈)는 제외하고 의미 있는 구조화 필드만 사용한다.
export function buildSceneEmbeddingText(scene: ExtractedCaseScene): string {
  return [scene.sceneName, scene.sceneType, scene.action, scene.cameraAngle, scene.direction, scene.notes]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" · ");
}

export function buildDocumentEmbeddingText(doc: ExtractedCaseDocument, scenes: ExtractedCaseScene[]): string {
  return [
    (doc.departments ?? []).join(" "),
    doc.shootingType,
    (doc.keywords ?? []).join(" "),
    scenes.map((s) => s.sceneName).filter(Boolean).join(" "),
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" · ");
}

// /api/conti에서 신규 요청 조건으로 검색 쿼리 텍스트를 만들 때도 같은 스타일을 쓴다
// (사례 저장 시 임베딩한 텍스트와 결이 비슷해야 유사도 검색이 잘 맞는다).
export function buildQueryEmbeddingText(input: { specialties: string; purpose?: string; notes?: string }): string {
  return [input.specialties, input.purpose, input.notes].filter((v): v is string => Boolean(v && v.trim())).join(" · ");
}

export type { ContiCaseScene };
