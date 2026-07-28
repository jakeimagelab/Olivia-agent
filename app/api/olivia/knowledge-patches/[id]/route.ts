import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.category !== undefined) patch.category = body.category;
    if (body.content !== undefined) patch.content = body.content;
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

    const { data, error } = await supabase
      .from("olivia_knowledge_patches")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, patch: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "지식 패치 수정 실패" }, { status: 500 });
  }
}
