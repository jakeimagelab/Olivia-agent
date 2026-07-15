import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("conti_saves")
      .select("id, hospital_name, specialties, title, saved_at, result")
      .order("saved_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hospitalName, specialties, title, result } = await req.json();
    const db = getSupabaseAdmin();

    const { data: existing } = await db
      .from("conti_saves")
      .select("id")
      .eq("hospital_name", hospitalName || "병원명 없음")
      .single();

    if (existing?.id) {
      const { error } = await db
        .from("conti_saves")
        .update({ specialties, title, result, saved_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const { data, error } = await db.from("conti_saves").insert({
      hospital_name: hospitalName || "병원명 없음",
      specialties: specialties || [],
      title: title || "",
      result,
    }).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, hospitalName } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("conti_saves")
      .update({ hospital_name: hospitalName })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const db = getSupabaseAdmin();
    const item = await moveRecordToTrash(db, "conti_save", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
