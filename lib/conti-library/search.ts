import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContiCaseSceneMatch } from "./types";

// match_conti_case_scenes RPC 래퍼. embedding이 없거나(임베딩 실패) RPC 호출 자체가 실패하면
// 예외 대신 빈 배열을 반환한다 — 호출부(특히 /api/conti)가 이 기능 없이도 기존처럼 동작해야 한다.
export async function matchContiCaseScenes(
  db: SupabaseClient,
  queryEmbedding: number[],
  departmentFilter: string[] | null,
  matchCount: number,
): Promise<ContiCaseSceneMatch[]> {
  const { data, error } = await db.rpc("match_conti_case_scenes", {
    query_embedding: queryEmbedding,
    department_filter: departmentFilter,
    match_count: matchCount,
  });
  if (error) {
    console.error("[conti-library] match_conti_case_scenes 실패:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, any>[]).map((row) => ({
    id: row.id,
    caseDocumentId: row.case_document_id,
    sceneName: row.scene_name,
    sceneType: row.scene_type,
    department: row.department ?? null,
    location: row.location ?? null,
    action: row.action ?? null,
    cameraAngle: row.camera_angle ?? null,
    direction: row.direction ?? null,
    notes: row.notes ?? null,
    clinicName: row.clinic_name ?? null,
    fileName: row.file_name,
    similarity: row.similarity,
  }));
}

// 프롬프트 토큰 예산을 지키기 위해 서로 다른 문서 최대 N개까지만 남기고, 같은 문서에서 온
// 장면은 유사도 순으로 잘라낸다(요청서 35장: "문서 사례 3~5건").
export function capByDistinctDocument(hits: ContiCaseSceneMatch[], maxDocuments: number): ContiCaseSceneMatch[] {
  const seenDocuments = new Set<string>();
  const result: ContiCaseSceneMatch[] = [];
  for (const hit of hits) {
    if (!seenDocuments.has(hit.caseDocumentId)) {
      if (seenDocuments.size >= maxDocuments) continue;
      seenDocuments.add(hit.caseDocumentId);
    }
    result.push(hit);
  }
  return result;
}
