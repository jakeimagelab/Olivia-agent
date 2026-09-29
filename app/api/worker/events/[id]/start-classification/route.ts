import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { PhotoPipelineStartError, startNasBackupClassification } from "@/lib/photo-storage/nasClassifyHandoff";
import { isPhotoAutomationAvailable } from "@/lib/photo-storage/photoAutomation";
import { departmentFromPhotoText } from "@/lib/photo-classifier/departmentResolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// NAS 알림의 "분류 시작"은 전체 분류를 바로 시작한다. 진료과는 폴더/고객 정보에서,
// 현장·스튜디오 구분은 사진별 AI가 판정하므로 두 값을 화면에서 받지 않는다.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "올바르지 않은 이벤트 ID입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const only = body.only === "연출" || body.only === "프로필" || body.only === "인테리어" ? body.only : "all";

  try {
    const db = getSupabaseAdmin();
    if (!await isPhotoAutomationAvailable(db)) {
      return Response.json({ ok: false, code: "PHOTO_AI_UNAVAILABLE", error: "자동 기능이 꺼져 있습니다. 수동으로 직접하시겠습니까?" }, { status: 409 });
    }
    const { data: event, error: eventError } = await db
      .from("worker_events")
      .select("id,folder_name")
      .eq("id", id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return Response.json({ ok: false, error: "이벤트를 찾지 못했습니다." }, { status: 404 });

    const project = await startNasBackupClassification(db, {
      folderName: event.folder_name as string,
      department: departmentFromPhotoText(String(event.folder_name || "")) ?? "general",
      only,
      confirmRestart: body.confirmRestart === true,
      approvedBy: "olivia-notification",
    });

    await db.from("worker_events").update({ status: "STARTED" }).eq("id", id);

    return Response.json({ ok: true, projectId: project.id, status: project.status });
  } catch (error) {
    console.error("[worker/events start-classification]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "분류 시작에 실패했습니다.",
        ...(error instanceof PhotoPipelineStartError ? { code: error.code, details: error.details } : {}),
      },
      { status: error instanceof PhotoPipelineStartError ? 409 : 500 },
    );
  }
}
