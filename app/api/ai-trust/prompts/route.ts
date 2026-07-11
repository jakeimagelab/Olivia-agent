import { NextRequest, NextResponse } from "next/server";
import { generateDemandBasedPrompts } from "@/lib/ai-trust/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompts = generateDemandBasedPrompts({
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    treatments: Array.isArray(body.treatments) ? body.treatments : [],
    symptoms: Array.isArray(body.symptoms) ? body.symptoms : [],
    region: body.region || "",
    department: body.department || "",
    language: body.language || "ko",
  });

  return NextResponse.json({ ok: true, prompts });
}
