import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { PhotoPipelineStartError, startNasBackupClassification } from "@/lib/photo-storage/nasClassifyHandoff";
import { DEPARTMENT_DISPLAY, type MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEPARTMENTS = new Set(Object.keys(DEPARTMENT_DISPLAY));

// 코드 요청서(2026-09-18) 작업 D — BackupReadyNotifications.tsx의 "[분류 시작]" 버튼이 부르는
// 경량 API. nas_backup_start_sort(Hermes 도구)와 같은 헬퍼(startNasBackupClassification)를
// 써서 PHASE 6 파이프라인(씬별분류/)으로 연결한다 — department/shooting_mode는 이 요청 body에서
// 명시적으로 받은 값만 쓴다(추측 금지, nas_backup_start_sort와 동일 규칙).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "올바르지 않은 이벤트 ID입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const department = typeof body.department === "string" ? body.department : "";
  const shootingMode = body.shootingMode;
  if (!DEPARTMENTS.has(department)) {
    return Response.json({ ok: false, error: "진료과(department)를 선택해주세요 — 추측해서 분류를 시작하지 않습니다." }, { status: 400 });
  }
  if (shootingMode !== "field" && shootingMode !== "studio") {
    return Response.json({ ok: false, error: "촬영 모드(field 또는 studio)를 선택해주세요 — 추측해서 분류를 시작하지 않습니다." }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: event, error: eventError } = await db
      .from("worker_events")
      .select("id,folder_name")
      .eq("id", id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return Response.json({ ok: false, error: "이벤트를 찾지 못했습니다." }, { status: 404 });

    const project = await startNasBackupClassification(db, {
      folderName: event.folder_name as string,
      department: department as MedicalDepartment,
      shootingMode,
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
