import { NextRequest, NextResponse } from "next/server";
import { analyzeFolderPattern } from "@/lib/photo-classifier/server/folderPatternAi";
import type { FolderStats } from "@/lib/photo-classifier/pattern-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RequestBody = {
  department?: string;
  stats: FolderStats;
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
  if (!body?.stats) {
    return NextResponse.json({ ok: false, error: "stats is required" }, { status: 400 });
  }

  try {
    const pattern = await analyzeFolderPattern({
      department: body.department || "general",
      stats: body.stats,
    });
    return NextResponse.json({ ok: true, pattern });
  } catch (error) {
    console.error("[photo-classification-pattern]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
