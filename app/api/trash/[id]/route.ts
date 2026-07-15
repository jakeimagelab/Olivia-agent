import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { permanentlyDeleteTrashItem, restoreTrashItem, type TrashItem } from "@/lib/trash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadItem(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("trash_items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("휴지통 항목을 찾을 수 없습니다.");
  return { db, item: data as TrashItem };
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action !== "restore") return NextResponse.json({ ok: false, error: "지원하지 않는 작업입니다." }, { status: 400 });
    const { id } = await params;
    const { db, item } = await loadItem(id);
    await restoreTrashItem(db, item);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "복원 실패" }, { status: 409 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, item } = await loadItem(id);
    await permanentlyDeleteTrashItem(db, item);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "영구 삭제 실패" }, { status: 500 });
  }
}
