import { NextRequest } from "next/server";
import { processOliviaRequest } from "@/lib/assistant/core/legacyOliviaCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  return processOliviaRequest(body, req);
}
