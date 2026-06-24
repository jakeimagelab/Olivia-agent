import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("galleries")
    .select("*")
    .eq("hospital_id", session.clientId)
    .order("created_at", { ascending: false });

  await logPortalEvent({ clientId: session.clientId, eventType: "gallery_viewed" });

  return NextResponse.json({ ok: true, galleries: data ?? [] });
}
