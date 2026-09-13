import { NextRequest, NextResponse } from "next/server";
import { scanScenePurposes, type PurposeScanImage } from "@/lib/photo-classifier/server/sceneAi";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  department: MedicalDepartment;
  images: PurposeScanImage[];
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

  if (!body.department || !Array.isArray(body.images) || body.images.length === 0 || body.images.length > 30) {
    return NextResponse.json(
      { ok: false, error: "department, images(1~30장)가 필요합니다" },
      { status: 400 },
    );
  }

  try {
    const labels = await scanScenePurposes(body);
    return NextResponse.json({ ok: true, labels });
  } catch (error) {
    console.error("[photo-scene-purpose-scan]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
