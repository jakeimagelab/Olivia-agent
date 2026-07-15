import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { permanentlyDeleteTrashItem, type TrashItem } from "@/lib/trash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const source = req.nextUrl.searchParams.get("source");
    const queryText = req.nextUrl.searchParams.get("q")?.trim();
    let query = db.from("trash_items").select("*").order("deleted_at", { ascending: false }).limit(200);
    if (source) query = query.eq("source_type", source);
    if (queryText) {
      const safeQuery = queryText.replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s.-]/g, "").slice(0, 80);
      if (safeQuery) query = query.or(`title.ilike.%${safeQuery}%,preview.ilike.%${safeQuery}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "휴지통을 불러오지 못했습니다." }, { status: 500 });
  }
}

// 만료 항목 정리. CRON_SECRET이 설정된 환경에서는 Bearer 인증이 필요하다.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("trash_items").select("*").lte("expires_at", new Date().toISOString()).limit(100);
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "만료 항목 정리 실패" }, { status: 500 });
  }
}
