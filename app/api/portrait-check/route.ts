import { NextRequest, NextResponse } from "next/server";
import { analyzeProfilePhoto } from "@/lib/photo-classifier/server/sceneAi";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json() as { thumbnail?: string };
  if (!body.thumbnail) {
    return NextResponse.json({ ok: false, error: "thumbnail required" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const result = await analyzeProfilePhoto(body.thumbnail);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "분석 실패" },
      { status: 500 },
    );
  }
}
