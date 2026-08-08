import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_REFERENCE_DOCUMENTS, MAX_REFERENCE_SCENES } from "@/lib/conti-library/config";
import { embedTexts } from "@/lib/conti-library/embeddings";
import { capByDistinctDocument, matchContiCaseScenes } from "@/lib/conti-library/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 콘티 생성 전 "생성 전 유사 사례 표시"용 미리보기 — /api/conti가 내부적으로 쓰는 것과
// 같은 RPC/임베딩을 그대로 재사용하는 얇은 래퍼다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { queryText?: string; departments?: string[] } | null;
  const queryText = body?.queryText?.trim();
  if (!queryText) return NextResponse.json({ ok: false, error: "검색어가 없습니다." }, { status: 400 });

  const embeddings = await embedTexts([queryText]);
  if (!embeddings?.[0]) return NextResponse.json({ ok: true, hits: [], totalCases: 0 });

  const db = getSupabaseAdmin();
  const hits = await matchContiCaseScenes(db, embeddings[0], body?.departments?.length ? body.departments : null, MAX_REFERENCE_SCENES);
  const capped = capByDistinctDocument(hits, MAX_REFERENCE_DOCUMENTS);

  let totalCases = 0;
  if (body?.departments?.length) {
    const { count } = await db
      .from("conti_case_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "analyzed")
      .overlaps("departments", body.departments);
    totalCases = count ?? 0;
  }

  return NextResponse.json({ ok: true, hits: capped, totalCases });
}
