import type { NextRequest } from "next/server";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { startRemoteRawMatchJob } from "@/lib/photo-operations/remoteRawMatch";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const result = await startRemoteRawMatchJob(getSupabaseAdmin(), {
      projectRelativePath: input.projectRelativePath,
      selectedFileNames: input.selectedFileNames,
      confirmRestart: input.confirmRestart === true,
    });
    return Response.json({
      ok: true,
      project: result.project,
      job: {
        id: result.job.id,
        action: "PHOTO_RAW_MATCH",
        status: result.job.status,
        reused: result.job.reused,
      },
      projectRelativePath: result.projectRelativePath,
      selectedCount: result.selectedFileNames.length,
      outputRelativePath: "Selected_RAW",
    });
  } catch (error) {
    if (error instanceof OliviaToolError) {
      return Response.json(
        { ok: false, error: error.message, code: error.code, details: error.details },
        { status: error.code === "PHOTO_OPERATION_RESTART_CONFIRMATION_REQUIRED" ? 409 : 400 },
      );
    }
    console.error("[photo-operations raw-match POST]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "원격 RAW 매칭 작업을 생성하지 못했습니다." },
      { status: 400 },
    );
  }
}
