import { NextResponse } from "next/server";
import { getAiTrustProviderStatuses } from "@/lib/ai-trust/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, providers: getAiTrustProviderStatuses() });
}
