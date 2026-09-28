import type { SupabaseClient } from "@supabase/supabase-js";
import { collectSystemStatus } from "@/lib/system-status/service";
import {
  HEALTH_RULES,
  type HealthContext,
  type HealthGroup,
  type HealthRule,
  type HealthVerdict,
} from "./rules";

export type HealthFinding = {
  id?: string;
  ruleId: string;
  label: string;
  group: HealthGroup;
  severity: "error" | "warning";
  state: HealthVerdict["state"];
  detail?: string;
  remedy?: string;
  evidence?: unknown;
};

function deployedRevision(): string | null {
  for (const value of [process.env.VERCEL_GIT_COMMIT_SHA, process.env.OLIVIA_SERVER_REVISION, process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA]) {
    const normalized = value?.trim().toLowerCase();
    if (normalized && /^[0-9a-f]{7,64}$/.test(normalized)) return normalized;
  }
  return null;
}

function serializeEvidence(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function findingFrom(rule: HealthRule, verdict: HealthVerdict): HealthFinding {
  return {
    ruleId: rule.id,
    label: rule.label,
    group: rule.group,
    severity: rule.severity,
    state: verdict.state,
    detail: verdict.detail,
    ...(verdict.state === "issue" ? { remedy: verdict.remedy } : {}),
    evidence: verdict.evidence,
  };
}

/** Runs every independent rule even when one data source is unavailable. */
export async function evaluateHealthRules(input: {
  context: HealthContext;
  rules: readonly HealthRule[];
}): Promise<HealthFinding[]> {
  const settled = await Promise.allSettled(input.rules.map((rule) => rule.check(input.context)));
  return settled.map((result, index) => {
    const rule = input.rules[index];
    if (result.status === "fulfilled") return findingFrom(rule, result.value);
    return findingFrom(rule, {
      state: "unknown",
      detail: `점검 실행 중 오류가 발생했습니다: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    });
  });
}

async function persistFindings(db: SupabaseClient, findings: HealthFinding[], now: string): Promise<void> {
  const raw = db as unknown as { from: (table: string) => any };
  const { data: activeRows, error: activeError } = await raw.from("health_findings")
    .select("id,rule_id").is("resolved_at", null);
  if (activeError) throw new Error(activeError.message);
  const activeByRule = new Map((activeRows ?? []).map((row: { id: string; rule_id: string }) => [row.rule_id, row.id]));
  const writes = findings.map(async (finding) => {
    const activeId = activeByRule.get(finding.ruleId);
    if (finding.state === "ok") {
      if (!activeId) return;
      const { error } = await raw.from("health_findings").update({
        state: "ok", detail: finding.detail ?? null, remedy: null, evidence: serializeEvidence(finding.evidence), last_seen_at: now, resolved_at: now,
      }).eq("id", activeId);
      if (error) throw new Error(error.message);
      return;
    }
    const payload = {
      rule_id: finding.ruleId,
      state: finding.state,
      detail: finding.detail ?? null,
      remedy: finding.remedy ?? null,
      evidence: serializeEvidence(finding.evidence),
      last_seen_at: now,
    };
    if (activeId) {
      const { error } = await raw.from("health_findings").update(payload).eq("id", activeId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await raw.from("health_findings").insert(payload);
      if (error) throw new Error(error.message);
    }
  });
  const results = await Promise.allSettled(writes);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function persistMetrics(db: SupabaseClient, findings: HealthFinding[], now: string): Promise<void> {
  const raw = db as unknown as { from: (table: string) => any };
  const metricFindings = findings.filter((finding) => finding.ruleId === "log_growth" && finding.evidence);
  const results = await Promise.allSettled(metricFindings.map(async (finding) => {
    const { error } = await raw.from("health_rule_metrics").upsert({
      rule_id: finding.ruleId,
      evidence: serializeEvidence(finding.evidence),
      updated_at: now,
    }, { onConflict: "rule_id" });
    if (error) throw new Error(error.message);
  }));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}

export async function runHealthChecks(input: {
  db: SupabaseClient;
  groups?: readonly HealthGroup[];
  now?: Date;
  rules?: readonly HealthRule[];
}): Promise<{ checkedAt: string; findings: HealthFinding[]; persistenceError?: string }> {
  const now = input.now ?? new Date();
  const diagnostics = await collectSystemStatus({ db: input.db, now });
  const groups = input.groups ? new Set(input.groups) : null;
  const rules = (input.rules ?? HEALTH_RULES).filter((rule) => !groups || groups.has(rule.group));
  const context: HealthContext = { db: input.db, now, diagnostics, deployedRevision: deployedRevision() };
  const findings = await evaluateHealthRules({ context, rules });
  const checkedAt = now.toISOString();
  try {
    await Promise.all([persistFindings(input.db, findings, checkedAt), persistMetrics(input.db, findings, checkedAt)]);
    return { checkedAt, findings };
  } catch (error) {
    // A missing migration or a database outage must not turn a health cron into
    // a process-wide failure. The next run will retry persistence.
    return { checkedAt, findings, persistenceError: error instanceof Error ? error.message : String(error) };
  }
}
