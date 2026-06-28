import { NextRequest, NextResponse } from "next/server";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function POST(req: NextRequest) {
  const { thumbnails, department } = await req.json() as {
    thumbnails: string[];  // base64 data URLs, up to 6
    department: MedicalDepartment;
  };

  if (!thumbnails?.length) return NextResponse.json({ ok: false, error: "thumbnails required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const config = getDepartmentConfig(department);

  const imageContent = thumbnails.slice(0, 6).map((t) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: t.replace(/^data:image\/[^;]+;base64,/, ""),
    },
  }));

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: config.promptGuide },
          ],
        }],
      }),
    });

    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    const parsed = JSON.parse(match[0]) as {
      sceneType: string;
      confidence: number;
      detectedCues: string[];
      reason: string;
    };

    const rule = config.sceneTypes.find((r) => r.sceneType === parsed.sceneType);
    const suggestedFolderName = rule?.folderName ?? null;

    return NextResponse.json({
      ok: true,
      sceneType: parsed.sceneType,
      confidence: parsed.confidence ?? 0,
      detectedCues: parsed.detectedCues ?? [],
      reason: parsed.reason ?? "",
      suggestedFolderName,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
