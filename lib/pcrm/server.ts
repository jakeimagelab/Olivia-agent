import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validatePortalToken, type PortalSession } from "@/lib/clientPortal";
import { isPcrmUuid } from "./validation";

export function pcrmOk(data: Record<string, unknown> = {}, status = 200) {
  return Response.json({ ok: true, ...data }, { status });
}

export function pcrmError(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function getPortalProjectContext(req: NextRequest): Promise<{
  db: ReturnType<typeof getSupabaseAdmin>;
  session: PortalSession;
} | null> {
  const session = await validatePortalToken(req.headers.get("x-portal-token") ?? "");
  if (!session?.workflowRunId || !session.projectScoped) return null;
  return { db: getSupabaseAdmin(), session };
}

export async function validateAdminProject(clientId: unknown, workflowRunId: unknown) {
  if (!isPcrmUuid(clientId) || !isPcrmUuid(workflowRunId)) return null;
  const db = getSupabaseAdmin();
  const { data } = await db.from("workflow_runs")
    .select("id,client_id,project_name")
    .eq("id", workflowRunId)
    .eq("client_id", clientId)
    .maybeSingle();
  return data ? { db, run: data } : null;
}

export async function verifyPortalEntity(
  db: ReturnType<typeof getSupabaseAdmin>,
  session: PortalSession,
  table: string,
  id: string,
) {
  if (!isPcrmUuid(id) || !session.workflowRunId) return null;
  const { data } = await db.from(table)
    .select("id,client_id,workflow_run_id")
    .eq("id", id)
    .eq("client_id", session.clientId)
    .eq("workflow_run_id", session.workflowRunId)
    .maybeSingle();
  return data;
}
