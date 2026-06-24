import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const clientId = session.clientId;

  const [clientRes, galleryRes, revisionRes, reviewRes, eventsRes, perRes] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).single(),
    db.from("galleries").select("id,title,shoot_date,status,gallery_link,retouched_link,original_link,created_at").eq("hospital_id", clientId).order("created_at", { ascending: false }).limit(5),
    db.from("client_revision_requests").select("id,title,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    db.from("client_reviews").select("id,overall_rating,created_at").eq("client_id", clientId).limit(1),
    db.from("client_portal_events").select("event_type,memo,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
    db.from("clients").select("available_points,total_earned_points,reward_tier,per_joined").eq("id", clientId).single(),
  ]);

  return NextResponse.json({
    ok: true,
    session,
    client: clientRes.data,
    galleries: galleryRes.data ?? [],
    revisions: revisionRes.data ?? [],
    hasReview: (reviewRes.data?.length ?? 0) > 0,
    events: eventsRes.data ?? [],
    per: perRes.data,
  });
}
