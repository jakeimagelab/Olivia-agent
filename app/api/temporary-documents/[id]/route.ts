import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTemporaryDocument, linkTemporaryDocumentsForHospital, updateTemporaryDocumentStatus } from "@/lib/olivia/documents/temporaryDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ ok: true, document: await getTemporaryDocument(getSupabaseAdmin(), id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "임시문서 조회 실패" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json() as { action?: string };
    const db = getSupabaseAdmin();
    if (body.action === "approve_content") {
      const document = await updateTemporaryDocumentStatus(db, id, "pending_client", { contentApprovedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, document, message: `${document.hospital_name}을 고객으로 등록할까요?` });
    }
    if (body.action === "defer") {
      const document = await updateTemporaryDocumentStatus(db, id, "pending_review", { deferredAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, document, message: "임시문서함에 그대로 보관했어요." });
    }
    if (body.action === "link_client") {
      const result = await linkTemporaryDocumentsForHospital(db, id);
      const message = result.failed.length
        ? `${result.client.hospital_name} 고객을 등록하고 ${result.linked.length}개 문서를 연결했지만 ${result.failed.length}개는 임시문서함에 남았어요.`
        : `${result.client.hospital_name} 고객을 등록하고 관련 문서 ${result.linked.length}개를 모두 연결했어요.`;
      return NextResponse.json({ ok: true, result, message });
    }
    return NextResponse.json({ ok: false, error: "지원하지 않는 임시문서 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "임시문서 처리 실패" }, { status: 500 });
  }
}
