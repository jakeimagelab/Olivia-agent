import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateShareToken, getFileExpiresAt } from "@/lib/selectGallery";
import { advanceWorkflow } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const body = await req.json();
    const {
      clientId,
      workflowRunId,
      title,
      hospitalName,
      shootingName,
      shootingDate,
      expireDays = 3,
      scenes = [],
    } = body;

    if (!title) return NextResponse.json({ ok: false, error: "title 필수" }, { status: 400 });

    let workflowRun: { id: string; current_step_key: string } | null = null;
    if (workflowRunId) {
      const { data: run, error: runError } = await sb.from("workflow_runs")
        .select("id,current_step_key")
        .eq("id", workflowRunId)
        .maybeSingle();
      if (runError) throw runError;
      if (!run) return NextResponse.json({ ok: false, error: "연결된 프로젝트 진행 정보를 찾을 수 없습니다." }, { status: 404 });
      if (!["backup_sorting", "client_selection"].includes(run.current_step_key)) {
        return NextResponse.json({ ok: false, error: `현재 ${run.current_step_key} 단계에서는 셀렉 갤러리를 만들 수 없습니다.` }, { status: 409 });
      }
      workflowRun = run;
    }

    // 고객 정보 자동 조회
    let clientInfo: any = null;
    if (clientId) {
      const { data } = await sb
        .from("clients")
        .select("id, name, hospital_name, manager_name, email, phone")
        .eq("id", clientId)
        .single();
      clientInfo = data;
    }

    const shareToken = generateShareToken();
    const fileExpiresAt = getFileExpiresAt(expireDays);

    // 총 이미지 수 계산
    const totalCount = scenes.reduce((sum: number, s: any) => sum + (s.images?.length ?? 0), 0);

    const { data: gallery, error: galErr } = await sb
      .from("select_galleries")
      .insert({
        title,
        hospital_name: hospitalName ?? clientInfo?.hospital_name ?? null,
        shooting_name: shootingName ?? null,
        shooting_date: shootingDate ?? null,
        client_id: clientId ?? null,
        workflow_run_id: workflowRunId ?? null,
        share_token: shareToken,
        file_expires_at: fileExpiresAt,
        status: "draft",
        allow_web_select: true,
        allow_download_upload: true,
        allow_download_zip: false,
        allow_resubmit: false,
        total_jpg_count: totalCount,
      })
      .select()
      .single();

    if (galErr) throw galErr;

    // 씬별 이미지 메타데이터 등록 (실제 파일 업로드 없이 파일명만 등록)
    if (scenes.length > 0) {
      const imageRows: any[] = [];
      for (const scene of scenes) {
        for (const img of scene.images ?? []) {
          imageRows.push({
            gallery_id: gallery.id,
            original_file_name: img.originalFileName,
            basename: img.basename,
            extension: img.originalFileName?.split(".").pop()?.toLowerCase() ?? "jpg",
            scene_name: scene.sceneName ?? null,
            folder_name: scene.folderName ?? null,
            image_url: img.imageUrl ?? null,
            thumbnail_url: img.thumbnailUrl ?? null,
            preview_url: img.previewUrl ?? null,
            file_size: img.fileSize ?? null,
            expires_at: fileExpiresAt,
            sort_order: img.sortOrder ?? 0,
          });
        }
      }
      if (imageRows.length > 0) {
        await sb.from("select_gallery_images").insert(imageRows);
      }
    }

    // 분류 결과가 실제 셀렉 갤러리로 생성된 뒤에만 기존 Workflow Command로 전진한다.
    // 갤러리·이미지는 이미 저장됐으므로, 단계 전진이 건너뛰어져도(skipped) 이 요청 자체를
    // 실패로 만들지 않는다 — 그 시점에 throw하면 화면엔 500이 뜨지만 갤러리는 이미 만들어진
    // 상태로 남아 사용자가 "실패했다"고 오해한다. advance 필드로 사실만 별도로 알린다.
    let advance: { advanced: boolean; reason?: string } = { advanced: false };
    if (workflowRun && workflowRun.current_step_key !== "client_selection") {
      const advanced = await advanceWorkflow(sb, {
        workflow_run_id: workflowRun.id,
        from_step_key: workflowRun.current_step_key,
        to_step_key: "client_selection",
        reason: "셀렉 갤러리 생성",
      });
      advance = advanced.skipped
        ? { advanced: false, reason: advanced.reason || "프로젝트 단계가 변경되었습니다." }
        : { advanced: true };
    }

    return NextResponse.json({ ok: true, gallery, shareToken, advance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
