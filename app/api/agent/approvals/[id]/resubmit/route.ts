import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const memo = typeof body.memo === "string" ? body.memo.trim() : "";

  const { data, error } = await getSupabaseAdmin().rpc("resubmit_client_revision", {
    p_approval_id: id,
    p_admin_memo: memo,
  });

  if (error) {
    if (error.message.includes("NOT_FOUND")) {
      return NextResponse.json({ ok: false, error: "수정 요청 또는 승인 항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (error.message.includes("NOT_IN_REVISION")) {
      return NextResponse.json({ ok: false, error: "수정 요청 상태인 승인 항목만 재제출할 수 있습니다." }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: "수정본을 승인 대기로 보내지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, approvalId: result?.approval_id ?? id, revisionId: result?.revision_id });
}
