import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { permanentlyDeleteTrashItem, type TrashItem } from "@/lib/trash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("trash_items")
      .select("*")
      .lte("expires_at", new Date().toISOString())
      .limit(100);
    if (error) throw error;

    let deleted = 0;
    const failures: string[] = [];
    for (const row of data ?? []) {
      try {
        await permanentlyDeleteTrashItem(db, row as TrashItem);
        deleted += 1;
      } catch (error) {
        failures.push(`${row.id}: ${error instanceof Error ? error.message : "삭제 실패"}`);
      }
    }

    return NextResponse.json({ ok: failures.length === 0, deleted, failures });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "만료 항목 정리 실패" },
      { status: 500 },
    );
  }
}
