import { NextRequest, NextResponse } from "next/server";
import { searchDocuments } from "@/lib/olivia/documents/searchDocuments";
import { normalizeDocumentTypeHint } from "@/lib/olivia/documents/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /admin/tools의 통합 문서함 검색창과 채팅의 search_documents 도구가 반드시 같은 검색 로직을
// 거치도록, 이 라우트는 searchDocuments()를 그대로 감싸기만 한다 — 별도 필터/랭킹을 만들지 않는다.
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const documents = await searchDocuments({
      query: params.get("q") || undefined,
      clientName: params.get("clientName") || undefined,
      types: params.get("type") ? [normalizeDocumentTypeHint(params.get("type"))].filter((type): type is NonNullable<typeof type> => Boolean(type)) : undefined,
      limit: params.get("limit") ? Number(params.get("limit")) : 30,
    });
    return NextResponse.json({ ok: true, documents });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
