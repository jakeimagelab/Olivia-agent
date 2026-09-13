import { NextRequest, NextResponse } from "next/server";
import { analyzePhotoScene, type SceneAiImage } from "@/lib/photo-classifier/server/sceneAi";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RequestBody = {
  department: MedicalDepartment;
  sceneId: string;
  images: SceneAiImage[];
  options?: { useHighModel?: boolean };
};

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.department || !body.sceneId || !Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json(
      { ok: false, error: "department, sceneId, images are required" },
      { status: 400 },
    );
  }

  try {
    const result = await analyzePhotoScene({
      department: body.department,
      sceneId: body.sceneId,
      images: body.images,
      useHighModel: body.options?.useHighModel,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[photo-scene-analyze]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
