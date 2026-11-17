import type { NextRequest } from "next/server";

import { AdminDeliveryNotFoundError, deleteAdminDelivery } from "@/lib/person-select/adminDeliveryDelete";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventId: string; deliveryId: string }> },
) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const { eventId, deliveryId } = await context.params;
  try {
    const result = await deleteAdminDelivery(getSupabaseAdmin(), { eventId, deliveryId });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AdminDeliveryNotFoundError) {
      return Response.json({ ok: false, error: error.message }, { status: 404 });
    }
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "보정본을 삭제하지 못했습니다.",
    }, { status: 500 });
  }
}
