import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCenterSummary, AgentCenterItem } from "@/components/olivia-agent-center/types";
import type { OliviaAgentRun } from "@/lib/olivia/agentRuns/types";

export function isStalledProject(row: Record<string, unknown>, now = new Date(), days = 7) {
  if (row.status !== "active") return false;
  const updated = new Date(String(row.updated_at || row.created_at || 0)).getTime();
  return Number.isFinite(updated) && now.getTime() - updated >= days * 86_400_000;
}

export function sortRecentResults<T extends { completed_at?: string | null; updated_at?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => new Date(b.completed_at || b.updated_at || 0).getTime() - new Date(a.completed_at || a.updated_at || 0).getTime());
}

type NamedResult = { name: string; promise: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

export async function getAgentCenterSummary(db: SupabaseClient): Promise<AgentCenterSummary> {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const stalledBefore = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const queries: NamedResult[] = [
    { name: "runningRuns", promise: db.from("olivia_agent_runs").select("*").in("status", ["queued","planning","running","waiting_approval","paused"]).order("updated_at", { ascending: false }).limit(30) },
    { name: "pendingApprovals", promise: db.from("agent_approvals").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(30) },
    { name: "todayItems", promise: db.from("calendar_tasks").select("*").eq("date", today).eq("completed", false).order("time", { ascending: true, nullsFirst: false }).limit(30) },
    { name: "stalledProjects", promise: db.from("workflow_runs").select("*").eq("status", "active").lt("updated_at", stalledBefore).order("updated_at").limit(30) },
    { name: "proactiveInsights", promise: db.from("olivia_insights").select("*").in("status", ["open","acknowledged","action_created"]).order("priority_score", { ascending: false }).limit(30) },
    { name: "recentResults", promise: db.from("olivia_agent_runs").select("*").eq("status", "completed").order("completed_at", { ascending: false }).limit(20) },
  ];
  const settled = await Promise.allSettled(queries.map((query) => Promise.resolve(query.promise)));
  const values: Record<string, unknown[]> = {};
  const partialErrors: string[] = [];
  settled.forEach((result, index) => {
    const name = queries[index].name;
    if (result.status === "rejected") { partialErrors.push(`${name}: ${String(result.reason)}`); values[name] = []; return; }
    if (result.value.error) { partialErrors.push(`${name}: ${result.value.error.message}`); values[name] = []; return; }
    values[name] = result.value.data ?? [];
  });
  const stalledProjects = (values.stalledProjects ?? []).filter((row) => isStalledProject(row as Record<string, unknown>, now)) as AgentCenterItem[];
  const recentResults = sortRecentResults((values.recentResults ?? []) as OliviaAgentRun[]);
  return {
    ok: true, generatedAt: now.toISOString(),
    counts: { running: values.runningRuns.length, approvals: values.pendingApprovals.length, today: values.todayItems.length, stalled: stalledProjects.length, insights: values.proactiveInsights.length, completed: recentResults.length },
    runningRuns: values.runningRuns as OliviaAgentRun[], pendingApprovals: values.pendingApprovals as AgentCenterItem[],
    todayItems: values.todayItems as AgentCenterItem[], stalledProjects, proactiveInsights: values.proactiveInsights as AgentCenterItem[], recentResults,
    partialErrors,
  };
}
