import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { registerGalleryLink } from "@/lib/core/commands/photo";
import {
  updateManualShootingProgress,
} from "@/lib/photo-storage/shootingProgressActions";
import type { ShootingProgressActionStage, ShootingProgressManualState } from "@/lib/photo-storage/shootingProgress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTION_STAGES = new Set<ShootingProgressActionStage>([
  "original_delivery",
  "client_selection",
  "raw_matching",
  "retouching",
  "final_delivery",
]);
const MANUAL_STATES = new Set<ShootingProgressManualState>(["completed", "skipped", "restored"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const db = getSupabaseAdmin();

    if (action === "register_link") {
      const result = await registerGalleryLink(db, {
        projectId: id,
        url: body.nasLink,
        clientId: typeof body.clientId === "string" ? body.clientId : null,
        baseUrl: request.nextUrl.origin,
      });
      if (!result.ok) return Response.json({ ok: false, error: result.reason, code: result.code }, { status: 400 });
      return Response.json({ ok: true, ...result.value });
    }

    const stage = body.stage;
    const state = body.state;
    if (!ACTION_STAGES.has(stage as ShootingProgressActionStage) || !MANUAL_STATES.has(state as ShootingProgressManualState)) {
      return Response.json({ ok: false, error: "지원하지 않는 촬영 진행 작업입니다." }, { status: 400 });
    }
    const result = await updateManualShootingProgress(db, {
      projectId: id,
      stage: stage as ShootingProgressActionStage,
      state: state as ShootingProgressManualState,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[shooting progress action]", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "촬영 진행 상태를 변경하지 못했습니다.",
    }, { status: 500 });
  }
}
