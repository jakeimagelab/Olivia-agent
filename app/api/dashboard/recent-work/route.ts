import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RecentWorkItem = {
  id: string;
  kind: "콘티" | "견적" | "계약";
  title: string;
  timestamp: string;
};

// 홈 "최근 작업" 위젯 — 콘티/견적/계약 저장 시각을 합쳐서 최신순으로 보여준다.
// 새 테이블/새 로직 없이 기존 conti_saves/quotes/contracts를 그대로 읽기만 한다.
export async function GET() {
  const db = getSupabaseAdmin();

  const [contiRes, quoteRes, contractRes] = await Promise.all([
    db.from("conti_saves").select("id, hospital_name, title, saved_at").order("saved_at", { ascending: false }).limit(6),
    db.from("quotes").select("id, hospital_name, title, created_at").order("created_at", { ascending: false }).limit(6),
    db.from("contracts").select("id, hospital_name, created_at").order("created_at", { ascending: false }).limit(6),
  ]);

  const items: RecentWorkItem[] = [
    ...(contiRes.data ?? []).map((row): RecentWorkItem => ({
      id: `conti:${row.id}`,
      kind: "콘티",
      title: row.title || `${row.hospital_name || "이름 없는 고객"} 콘티`,
      timestamp: row.saved_at,
    })),
    ...(quoteRes.data ?? []).map((row): RecentWorkItem => ({
      id: `quote:${row.id}`,
      kind: "견적",
      title: row.title || `${row.hospital_name || "이름 없는 고객"} 견적서`,
      timestamp: row.created_at,
    })),
    ...(contractRes.data ?? []).map((row): RecentWorkItem => ({
      id: `contract:${row.id}`,
      kind: "계약",
      title: `${row.hospital_name || "이름 없는 고객"} 계약서`,
      timestamp: row.created_at,
    })),
  ]
    .filter((item) => Boolean(item.timestamp))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  return NextResponse.json({ ok: true, items });
}
