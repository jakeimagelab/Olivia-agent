import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.workflow_run_id) {
    return NextResponse.json({ ok: false, error: "workflow_run_id 필수" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // 원본 데이터 전달 단계에서 NAS 링크가 함께 오면 photo_galleries에 원본(original) 레코드로 남긴다.
    // clients.original_photos_link 반영은 여기서 직접 하지 않고 DB 트리거(trg_sync_gallery_to_client)가 처리한다 —
    // 보정 갤러리(app/api/galleries/route.ts)와 동일한 한 경로로 통합.
    if (body.nas_link) {
      const { data: run } = await db
        .from("workflow_runs")
        .select("client_id, client_name")
        .eq("id", body.workflow_run_id)
        .maybeSingle();
      if (run?.client_id) {
        await db.from("photo_galleries").insert({
          hospital_name: run.client_name || "",
          client_id: run.client_id,
          workflow_run_id: body.workflow_run_id,
          nas_link: body.nas_link,
          gallery_type: "original",
        });
      }
    }

    const result = await advanceWorkflow(db, {
      workflow_run_id: body.workflow_run_id,
      to_step_key: body.to_step_key ?? null,
      from_step_key: body.from_step_key ?? null,
      reason: body.reason ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
