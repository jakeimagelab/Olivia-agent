import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUiTestMode() {
  return process.env.NODE_ENV !== "production" && process.env.UI_TEST_MODE === "1";
}

export async function GET(req: NextRequest) {
  const authenticated = req.cookies.get("pc_admin_session")?.value === "active" || isUiTestMode();
  return NextResponse.json({ ok: true, authenticated });
}
