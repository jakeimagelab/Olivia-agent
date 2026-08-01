import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });

  const { is_favorite, title, content, tags } = body;
  const updates = Object.fromEntries(
    Object.entries({ is_favorite, title, content, tags }).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "변경할 필드가 없습니다." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("library_items").update(updates).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
