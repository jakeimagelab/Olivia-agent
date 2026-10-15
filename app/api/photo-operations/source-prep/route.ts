import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { startPhotoSourcePreparation, PhotoPipelineStartError } from "@/lib/photo-storage/nasClassifyHandoff";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const folderName = typeof input.folderName === "string" ? input.folderName.trim() : "";
  if (!folderName) {
    return Response.json({ ok: false, error: "JPG를 정리할 Mac Studio 폴더를 선택해주세요." }, { status: 400 });
  }

  try {
    const project = await startPhotoSourcePreparation(getSupabaseAdmin(), {
      folderName,
      confirmRestart: input.confirmRestart === true,
      approvedBy: "photo-workspace",
    });
    return Response.json({
      ok: true,
      project: {
        id: project.id,
        name: project.project_name,
        sourceRelativePath: project.source_relative_path,
        status: project.status,
      },
      action: "PHOTO_PREPARE_SOURCE",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mac Studio JPG정리를 시작하지 못했습니다.";
    const status = error instanceof PhotoPipelineStartError ? 409 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
