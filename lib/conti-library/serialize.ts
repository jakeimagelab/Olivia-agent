import type { ContiCaseDocument, ContiCaseScene } from "./types";

export function rowToDocument(row: Record<string, any>): ContiCaseDocument {
  return {
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileHash: row.file_hash,
    clinicName: row.clinic_name ?? null,
    departments: row.departments ?? [],
    shootingType: row.shooting_type ?? null,
    doctorCount: row.doctor_count ?? null,
    sceneCount: row.scene_count ?? 0,
    status: row.status,
    metadata: row.metadata ?? {},
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToScene(row: Record<string, any>): ContiCaseScene {
  return {
    id: row.id,
    caseDocumentId: row.case_document_id,
    sceneOrder: row.scene_order ?? 0,
    sceneName: row.scene_name ?? "",
    sceneType: row.scene_type,
    department: row.department ?? null,
    subjects: row.subjects ?? [],
    location: row.location ?? null,
    action: row.action ?? null,
    cameraAngle: row.camera_angle ?? null,
    shotSize: row.shot_size ?? null,
    pose: row.pose ?? null,
    props: row.props ?? [],
    equipment: row.equipment ?? [],
    direction: row.direction ?? null,
    notes: row.notes ?? null,
    rawText: row.raw_text ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}
