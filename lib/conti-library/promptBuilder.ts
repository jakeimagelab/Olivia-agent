import { SCENE_TYPE_LABELS_KO } from "./config";
import type { ContiCaseReference, ContiCaseSceneMatch } from "./types";

// 신규 콘티 요청 조건 → 유사 사례 검색용 쿼리 텍스트. 사례 저장 시 임베딩한 텍스트
// (scene_name+scene_type+action+camera_angle+direction+notes 조합)와 결이 비슷해야
// 유사도 검색이 잘 맞는다.
export function buildLibraryQueryText(input: { specialties: string; purpose?: string; notes?: string }): string {
  return [input.specialties, input.purpose, input.notes]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" · ");
}

// 요청서 16장의 지시문을 그대로 사용 — "일반적인 아이디어를 자유롭게 창작하기보다
// 과거 사례에서 반복적으로 사용된 장면 구성과 촬영 방식을 우선 재사용"하도록 명시한다.
// userPrompt에 덧붙이는 블록이라 systemPrompt(모듈 상수)는 건드리지 않는다.
export function buildReferenceBlock(hits: ContiCaseSceneMatch[]): string {
  if (hits.length === 0) return "";
  const sceneLines = hits
    .map((hit, index) => {
      const label = SCENE_TYPE_LABELS_KO[hit.sceneType] ?? hit.sceneType;
      const parts = [
        `${index + 1}. [${hit.clinicName || hit.fileName}] ${hit.sceneName} (${label})`,
        hit.location ? `장소: ${hit.location}` : null,
        hit.cameraAngle ? `구도: ${hit.cameraAngle}` : null,
        hit.action ? `행동: ${hit.action}` : null,
        hit.direction ? `연출 포인트: ${hit.direction}` : null,
      ].filter(Boolean);
      return parts.join(" / ");
    })
    .join("\n");

  return `

[참고 — 과거 확정 사례]
아래 사례들은 사용자가 과거 직접 작성하고 최종 확정한 콘티입니다.

새 콘티는 일반적인 아이디어를 자유롭게 창작하기보다,
과거 사례에서 반복적으로 사용된 장면 구성과 촬영 방식을 우선 재사용하십시오.

기존 사례와 동일하게 적용할 수 있는 부분은 유지하고,
이번 고객에게 필요한 차이만 수정하십시오.

새로운 장면은 기존 사례로 해결할 수 없는 경우에만 추가하십시오.

${sceneLines}`;
}

export function toReferenceSummary(hit: ContiCaseSceneMatch): ContiCaseReference {
  return {
    caseDocumentId: hit.caseDocumentId,
    caseTitle: hit.clinicName || hit.fileName,
    sceneId: hit.id,
    sceneName: hit.sceneName,
    similarity: hit.similarity,
  };
}
