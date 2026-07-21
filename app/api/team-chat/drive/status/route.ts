import { NextRequest, NextResponse } from "next/server";
import { getDriveConnectionStatus } from "@/lib/googleDrive/roomDrive";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.cookies.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const status = await getDriveConnectionStatus();
  return NextResponse.json({ ok: true, ...status });
}
