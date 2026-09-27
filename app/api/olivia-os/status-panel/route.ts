import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { collectStatusPanelData } from "@/lib/system-status/panelService";
import { collectSystemStatus } from "@/lib/system-status/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const now = new Date();
  const diagnostics = await collectSystemStatus({ db, now });
  const data = await collectStatusPanelData({ db, diagnostics, now });
  return Response.json(data);
}
