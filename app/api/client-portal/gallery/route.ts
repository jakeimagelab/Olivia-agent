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
  // photo_galleries가 실제로 갤러리가 쌓이는 테이블이다 (구 galleries 테이블은 아무도 쓰지 않아 항상 비어있었음).
  const { data } = await db
    .from("photo_galleries")
    .select("*")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: false });

  await logPortalEvent({ clientId: session.clientId, eventType: "gallery_viewed" });

  return NextResponse.json({ ok: true, galleries: data ?? [] });
}
