import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status   = searchParams.get("status");

  let query = db.from("reward_products").select("*").order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  if (status)   query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();
  const { name, category, description, price, required_points, image_url, stock, supplier, shipping_fee, status, is_featured, admin_memo } = body;

  if (!name || !category || required_points === undefined) {
    return NextResponse.json({ ok: false, error: "name, category, required_points 필수" }, { status: 400 });
  }

  const { data, error } = await db.from("reward_products").insert({
    name, category, description: description ?? "", price: price ?? 0,
    required_points, image_url: image_url ?? "", stock: stock ?? 999,
    supplier: supplier ?? "", shipping_fee: shipping_fee ?? 0,
    status: status ?? "active", is_featured: is_featured ?? false,
    admin_memo: admin_memo ?? "",
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });

  const allowed = ["name","category","description","price","required_points","image_url","stock","supplier","shipping_fee","status","is_featured","admin_memo"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in fields) patch[k] = fields[k];

  const { error } = await db.from("reward_products").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });
  try {
    const item = await moveRecordToTrash(db, "reward_product", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "상품 삭제 실패" }, { status: 500 });
  }
}
