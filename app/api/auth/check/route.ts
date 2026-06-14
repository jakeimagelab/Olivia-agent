import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const isAuthenticated = req.cookies.get("pc_admin_session")?.value === "active";
  return NextResponse.json({ ok: true, authenticated: isAuthenticated });
}
