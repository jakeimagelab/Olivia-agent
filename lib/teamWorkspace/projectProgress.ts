import { getSupabaseAdmin } from "@/lib/supabase";
import { calculateProjectProgress } from "./taskProgress";

export async function recalculateProjectProgress(projectId?: string | null): Promise<number> {
  if (!projectId) return 0;
  const db = getSupabaseAdmin();
  const { data: tasks, error } = await db
    .from("team_tasks")
    .select("status")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  const progress = calculateProjectProgress(tasks ?? []);
  const { error: updateError } = await db
    .from("team_projects")
    .update({ progress, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
  return progress;
}
