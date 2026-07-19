import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deductPoints, savePerMailingQueue } from "@/lib/per";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status");
  const clientId = searchParams.get("clientId");

  let query = db
    .from("reward_orders")
    .select("*, clients(name:hospital_name, manager_name:contact_name, email), reward_products(name, category, price)")
    .order("created_at", { ascending: false });

  if (status)   query = query.eq("status", status);
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, orders: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const { clientId, productId, quantity, usedPoints, extraPaymentAmount, shippingName, shippingPhone, shippingAddress, requestNote } = body;

  if (!clientId || !productId || !usedPoints) {
    return NextResponse.json({ ok: false, error: "clientId, productId, usedPoints 필수" }, { status: 400 });
  }

  const { data: client } = await db.from("clients").select("available_points, hospital_name, email, contact_name").eq("id", clientId).single();
  if ((client?.available_points ?? 0) < usedPoints) {
    return NextResponse.json({ ok: false, error: "포인트가 부족합니다." }, { status: 400 });
  }

  const { data: order, error } = await db.from("reward_orders").insert({
    client_id: clientId, product_id: productId,
    quantity: quantity ?? 1, used_points: usedPoints,
    extra_payment_amount: extraPaymentAmount ?? 0,
    shipping_name: shippingName ?? "", shipping_phone: shippingPhone ?? "",
    shipping_address: shippingAddress ?? "", request_note: requestNote ?? "",
    status: "pending",
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await savePerMailingQueue({
    type: "per_order",
    hospitalName: client?.hospital_name ?? "",
    clientId: clientId,
    contactName: client?.contact_name ?? "",
    toEmail: client?.email ?? "",
    subject: `[PER] 제품 신청이 접수되었습니다`,
    body: `안녕하세요, ${client?.hospital_name ?? ""}님.\n\nPER 리워드 제품 신청이 접수되었습니다. 관리자 확인 후 포인트 차감 및 배송이 진행됩니다.\n\n주문번호: ${order.id}\n사용 포인트: ${usedPoints.toLocaleString()}P\n\n좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.\n포토클리닉 드림`,
    sourceId: order.id,
  });

  return NextResponse.json({ ok: true, id: order.id });
}

export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id, status, adminMemo } = await req.json();
  if (!id || !status) return NextResponse.json({ ok: false, error: "id, status 필수" }, { status: 400 });

  const { data: order } = await db.from("reward_orders").select("*, clients(name:hospital_name, email, manager_name:contact_name)").eq("id", id).single();

  if (status === "approved" && order?.status === "pending") {
    try {
      const txId = await deductPoints(order.client_id, order.used_points, {
        type: "use", sourceType: "order", sourceId: id, memo: "제품 신청 포인트 차감",
      });
      await db.from("reward_orders").update({ status: "points_deducted", transaction_id: txId, admin_memo: adminMemo ?? "" }).eq("id", id);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
  } else {
    await db.from("reward_orders").update({ status, admin_memo: adminMemo ?? "" }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
