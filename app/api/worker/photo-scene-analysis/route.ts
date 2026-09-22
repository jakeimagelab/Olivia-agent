import { NextRequest } from "next/server";
import { isAuthorizedWorker } from "@/lib/remoteWorkerAuth";
import { hermesPhotoBrain } from "@/lib/photo-classifier/brain/hermesPhotoBrain";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import type { SceneAiImage } from "@/lib/photo-classifier/server/sceneAi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SCENE_IMAGES = 6;
const MAX_IMAGE_DATA_LENGTH = 900_000;
const MAX_TOTAL_IMAGE_DATA_LENGTH = 4_000_000;
const DEPARTMENTS = new Set<MedicalDepartment>([
  "dermatology",
  "dentistry",
  "ophthalmology",
  "orthopedics_neurosurgery",
  "pediatrics",
  "korean_medicine",
  "plastic_surgery",
  "obgyn",
  "internal_medicine_checkup",
  "general",
]);

class SceneInputError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseImages(value: unknown): SceneAiImage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SCENE_IMAGES) {
    throw new SceneInputError(`Scene 대표 이미지는 1~${MAX_SCENE_IMAGES}장이 필요합니다.`);
  }
  let totalLength = 0;
  return value.map((entry, index) => {
    const image = record(entry);
    const fileName = typeof image.fileName === "string" ? image.fileName.trim() : "";
    const base64 = typeof image.base64 === "string" ? image.base64 : "";
    if (!fileName || fileName.length > 255 || fileName.includes("\0")) {
      throw new SceneInputError(`대표 이미지 ${index + 1}의 파일명이 올바르지 않습니다.`);
    }
    if (!base64 || base64.length > MAX_IMAGE_DATA_LENGTH || !/^(data:image\/jpeg;base64,)?[A-Za-z0-9+/=]+$/.test(base64)) {
      throw new SceneInputError(`대표 이미지 ${index + 1} 데이터가 올바르지 않습니다.`);
    }
    totalLength += base64.length;
    if (totalLength > MAX_TOTAL_IMAGE_DATA_LENGTH) {
      throw new SceneInputError("Scene 대표 이미지의 전체 크기가 제한을 초과했습니다.");
    }
    return { fileName, base64 };
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) {
    return Response.json({ ok: false, error: "Unauthorized worker" }, { status: 401 });
  }

  try {
    const body = record(await request.json());
    const department = typeof body.department === "string" ? body.department : "";
    const sceneId = typeof body.sceneId === "string" ? body.sceneId.trim() : "";
    if (!DEPARTMENTS.has(department as MedicalDepartment)) {
      return Response.json({ ok: false, error: "지원하지 않는 진료과입니다." }, { status: 400 });
    }
    if (!sceneId || sceneId.length > 100 || sceneId.includes("\0")) {
      return Response.json({ ok: false, error: "Scene ID가 올바르지 않습니다." }, { status: 400 });
    }
    const images = parseImages(body.images);
    const analysis = await hermesPhotoBrain.analyzeScene({
      department: department as MedicalDepartment,
      sceneId,
      images,
      useHighModel: body.useHighModel === true,
    });
    const config = getDepartmentConfig(department as MedicalDepartment);
    const rule = config.sceneTypes.find((candidate) => candidate.sceneType === analysis.sceneType)
      ?? config.sceneTypes.find((candidate) => candidate.sceneType === "etc");
    if (!rule) throw new Error("진료과 Scene 규칙을 찾을 수 없습니다.");
    return Response.json({
      ok: true,
      analysis: {
        ...analysis,
        sceneType: rule.sceneType,
        displayName: rule.displayName,
        suggestedFolderName: rule.folderName,
        needsReview: rule.sceneType === "etc" || analysis.needsReview,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene 분석에 실패했습니다.";
    if (!(error instanceof SceneInputError)) console.error("[worker/photo-scene-analysis]", message);
    return Response.json({ ok: false, error: message }, { status: error instanceof SceneInputError ? 400 : 500 });
  }
}
