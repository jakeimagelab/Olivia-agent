import type { CASE_DOCUMENT_STATUSES, SCENE_TYPES } from "./config";

export type CaseDocumentStatus = (typeof CASE_DOCUMENT_STATUSES)[number];
export type SceneType = (typeof SCENE_TYPES)[number];

export type ContiCaseDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  fileHash: string;
  clinicName: string | null;
  departments: string[];
  shootingType: string | null;
  doctorCount: number | null;
  sceneCount: number;
  status: CaseDocumentStatus;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContiCaseScene = {
  id: string;
  caseDocumentId: string;
  sceneOrder: number;
  sceneName: string;
  sceneType: SceneType;
  department: string | null;
  subjects: string[];
  location: string | null;
  action: string | null;
  cameraAngle: string | null;
  shotSize: string | null;
  pose: string | null;
  props: string[];
  equipment: string[];
  direction: string | null;
  notes: string | null;
  rawText: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// AI 분석 응답(Claude가 반환하는 원시 JSON)에서 그대로 받는 형태 — DB row로 바뀌기 전 단계.
export type ExtractedCaseDocument = {
  clinicName?: string;
  departments?: string[];
  shootingType?: string;
  doctorCount?: number;
  keywords?: string[];
};

export type ExtractedCaseScene = {
  sceneOrder: number;
  sceneName: string;
  sceneType: SceneType;
  department?: string;
  subjects?: string[];
  location?: string;
  action?: string;
  cameraAngle?: string;
  shotSize?: string;
  pose?: string;
  props?: string[];
  equipment?: string[];
  direction?: string;
  notes?: string;
  rawText?: string;
};

// pgvector 검색 결과 — match_conti_case_scenes RPC 반환 shape과 1:1.
export type ContiCaseSceneMatch = {
  id: string;
  caseDocumentId: string;
  sceneName: string;
  sceneType: string;
  department: string | null;
  location: string | null;
  action: string | null;
  cameraAngle: string | null;
  direction: string | null;
  notes: string | null;
  clinicName: string | null;
  fileName: string;
  similarity: number;
};

// /api/conti 응답에 추가되는 "참고한 사례" 요약 — 화면 표시용, DB에 영구 저장하지 않는다(1차).
export type ContiCaseReference = {
  caseDocumentId: string;
  caseTitle: string;
  sceneId: string;
  sceneName: string;
  similarity: number;
};
