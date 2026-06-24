import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { title, hospital, specialties, result } = await req.json();
    if (!result) {
      return NextResponse.json({ ok: false, error: "콘티 데이터가 없습니다." }, { status: 400 });
    }

    const token = randomBytes(8).toString("base64url");
    const db = getSupabaseAdmin();

    const { error } = await db.from("conti_shares").insert({
      token,
      title: title || hospital || "콘티",
      hospital: hospital || "",
      specialties: specialties || "",
      result,
    });

    if (error) {
      console.error("[conti/share] DB error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, token });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "공유 링크 생성 실패" },
      { status: 500 }
    );
  }
}
