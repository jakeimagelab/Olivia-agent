import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getRetentionMilestone,
  retentionMessage,
  retentionTaskType,
  type RetentionAsset,
} from "@/lib/dataRetention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: runs, error } = await db.from("workflow_runs").select("*");
    if (error) throw error;

    let created = 0;
    const alerts = [];
    for (const run of runs ?? []) {
      const assets: Array<[RetentionAsset, string | null]> = [
        ["original", run.original_expires_at ?? null],
        ["retouched", run.retouched_expires_at ?? null],
      ];
      for (const [asset, expiresAt] of assets) {
        if (!expiresAt) continue;
        const milestone = getRetentionMilestone(expiresAt);
        if (!milestone) continue;
        const taskType = retentionTaskType(asset, milestone);
        const { data: existing } = await db.from("agent_tasks")
          .select("id").eq("workflow_run_id", run.id).eq("task_type", taskType).limit(1);
        if (existing?.length) continue;

        const supersededTypes = milestone === "expired"
          ? [retentionTaskType(asset, "30d"), retentionTaskType(asset, "7d")]
          : milestone === "7d" ? [retentionTaskType(asset, "30d")] : [];
        if (supersededTypes.length) {
          await db.from("agent_tasks").update({ status: "canceled", updated_at: new Date().toISOString() })
            .eq("workflow_run_id", run.id).in("task_type", supersededTypes).in("status", ["pending", "running"]);
        }

        const message = retentionMessage(asset, milestone, expiresAt);
        const { data: task, error: taskError } = await db.from("agent_tasks").insert({
          client_id: run.client_id ?? null,
          project_id: run.project_id ?? null,
          workflow_run_id: run.id,
          workflow_step_key: "customer_care",
          workflow_step_name: "고객관리 (주기 알람/이벤트)",
          client_name: run.client_name ?? "",
          project_name: run.project_name ?? "",
          task_type: taskType,
          title: `${run.client_name || "고객"} 데이터 보관 알림`,
          description: message,
          priority: milestone === "expired" ? "urgent" : milestone === "7d" ? "high" : "normal",
          status: "pending",
          input_data: { asset, expires_at: expiresAt, milestone },
        }).select().single();
        if (taskError) throw taskError;
        created += 1;
        alerts.push(task);
      }
    }
    return NextResponse.json({ ok: true, checked: runs?.length ?? 0, created, alerts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "보관 기한 점검 실패" }, { status: 500 });
  }
}
