import { NextRequest } from "next/server";
import { handleOliviaStreamPost } from "@/lib/olivia/v2/stream/streamRoute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleOliviaStreamPost(req);
}
