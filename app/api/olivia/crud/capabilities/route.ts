import { NextResponse } from "next/server";
import { getOliviaCrudCapabilities } from "@/lib/olivia/crud/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, capabilities: getOliviaCrudCapabilities() });
}
