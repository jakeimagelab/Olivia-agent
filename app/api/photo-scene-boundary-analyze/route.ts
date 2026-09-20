import { NextRequest, NextResponse } from "next/server";
import { analyzeSceneBoundary, type SceneAiImage } from "@/lib/photo-classifier/server/sceneAi";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type BoundaryRequest = {
  department: MedicalDepartment;
  boundaryIndex: number;
  before: SceneAiImage[];
  after: SceneAiImage[];
  timeGapSeconds?: number;
  options?: { useHighModel?: boolean };
};

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  let body: BoundaryRequest;
  try {
    body = await request.json() as BoundaryRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.department
    || !Number.isInteger(body.boundaryIndex)
    || !Array.isArray(body.before)
    || !Array.isArray(body.after)
    || body.before.length === 0
    || body.after.length === 0
    || body.before.length > 5
    || body.after.length > 5
  ) {
    return NextResponse.json(
      { ok: false, error: "department, boundaryIndex, before, after are required" },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeSceneBoundary({
      department: body.department,
      before: body.before,
      after: body.after,
      timeGapSeconds: body.timeGapSeconds,
      useHighModel: body.options?.useHighModel,
    });
    return NextResponse.json({ ok: true, boundaryIndex: body.boundaryIndex, analysis });
  } catch (error) {
    console.error("[photo-scene-boundary-analyze]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
