import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deductPoints, savePerMailingQueue } from "@/lib/per";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const clientId   = searchParams.get("clientId");

  let query = db
    .from("donation_records")
    .select("*, clients(name, manager_name), donation_campaigns(title, period_label)")
    .order("created_at", { ascending: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (clientId)   query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, donations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const { clientId, campaignId, points, hospitalNamePublic, displayName } = body;

  if (!clientId || !points) {
    return NextResponse.json({ ok: false, error: "clientId, points 필수" }, { status: 400 });
  }

  const { data: client } = await db.from("clients").select("name, email, manager_name, available_points").eq("id", clientId).single();
  if ((client?.available_points ?? 0) < points) {
    return NextResponse.json({ ok: false, error: "포인트가 부족합니다." }, { status: 400 });
  }

  const txId = await deductPoints(clientId, points, {
    type: "donate", sourceType: "donation", sourceId: campaignId ?? "",
    memo: "기부 포인트 사용",
  });

  const { data: record, error } = await db.from("donation_records").insert({
    campaign_id:          campaignId ?? null,
    client_id:            clientId,
    points,
    amount:               points,
    hospital_name_public: hospitalNamePublic ?? true,
    display_name:         displayName ?? client?.name ?? "",
    status:               "confirmed",
    transaction_id:       txId,
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (campaignId) {
    await db.from("donation_campaigns").update({
      current_points:    db.rpc as any,
    }).eq("id", campaignId);

    const { data: camp } = await db.from("donation_campaigns").select("current_points, participant_count").eq("id", campaignId).single();
    await db.from("donation_campaigns").update({
      current_points:   (camp?.current_points  ?? 0) + points,
      current_amount:   (camp?.current_points  ?? 0) + points,
      participant_count:(camp?.participant_count?? 0) + 1,
    }).eq("id", campaignId);
  }

  await savePerMailingQueue({
    type: "per_donation",
    hospitalName: client?.name ?? "",
    clientId: clientId,
    contactName:  client?.manager_name ?? "",
    toEmail:      client?.email ?? "",
    subject:      `[PER] 기부 참여 감사합니다`,
    body:         `안녕하세요, ${client?.name ?? ""}님.\n\n기부 참여 감사합니다.\n기부 포인트: ${points.toLocaleString()}P\n\n포토클리닉과 함께해 주셔서 감사합니다.\n\n좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.\n포토클리닉 드림`,
    sourceId:     record.id,
  });

  return NextResponse.json({ ok: true, id: record.id });
}
