import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { selection_id, matches } = await req.json();

    if (!selection_id || !Array.isArray(matches))
      return NextResponse.json({ ok: false, error: "selection_id와 matches 필수" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, client_id, workflow_run_id")
      .eq("id", id)
      .single();
    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    let workflowRun: { id: string; current_step_key: string } | null = null;
    if (gallery.workflow_run_id) {
      const { data: run, error: runError } = await sb.from("workflow_runs")
        .select("id,current_step_key")
        .eq("id", gallery.workflow_run_id)
        .maybeSingle();
      if (runError) throw runError;
      if (!run) return NextResponse.json({ ok: false, error: "연결된 프로젝트 진행 정보를 찾을 수 없습니다." }, { status: 404 });
      if (!["client_selection", "raw_matching", "retouching"].includes(run.current_step_key)) {
        return NextResponse.json({ ok: false, error: `현재 ${run.current_step_key} 단계에서는 RAW 매칭을 완료할 수 없습니다.` }, { status: 409 });
      }
      workflowRun = run;
    }

    await sb.from("select_raw_matches").delete().eq("gallery_id", id);

    const rows = matches.map((m: any) => ({
      gallery_id: id,
      selection_id,
      client_id: gallery.client_id,
      workflow_run_id: gallery.workflow_run_id,
      selected_jpg: m.selected_jpg,
      selected_basename: m.selected_basename,
      matched_raw: m.matched_raw ?? null,
      raw_extension: m.raw_extension ?? null,
      status: m.status,
      note: m.note ?? null,
    }));

    const { data: inserted, error: insErr } = await sb
      .from("select_raw_matches").insert(rows).select();
    if (insErr) throw insErr;

    const matchedCount = rows.filter(r => r.status === "matched").length;
    const now = new Date().toISOString();

    await sb
      .from("select_galleries")
      .update({ status: "raw_matched", updated_at: now })
      .eq("id", id);

    // 워크플로우 자동 진행: client_selection/raw_matching → retouching.
    // 과거 데이터는 client_selection에 머문 채 next_action만 raw_matching인 경우가 있어
    // 실제 현재 단계를 읽어 from_step_key로 넘긴다.
    if (workflowRun && workflowRun.current_step_key !== "retouching") {
        const advanced = await advanceWorkflow(sb, {
          workflow_run_id: workflowRun.id,
          from_step_key: workflowRun.current_step_key,
          to_step_key: "retouching",
          reason: "RAW 매칭 완료",
        });
        if (advanced.skipped) throw new Error(advanced.reason || "프로젝트 단계가 변경되었습니다.");
    }

    return NextResponse.json({ ok: true, total: rows.length, matched: matchedCount, rawMatches: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
