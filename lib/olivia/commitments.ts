import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type CommitmentInput = { text?: string; dueAt?: string | null; ownerName?: string };

function validDueAt(value: unknown) {
  if (!value || Number.isNaN(new Date(String(value)).getTime())) return null;
  return new Date(String(value)).toISOString();
}

function commitmentKey(memoId: string | null, ownerType: string, text: string) {
  const hash = createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 20);
  return `meeting_commitment:${memoId || "standalone"}:${ownerType}:${hash}`;
}

export async function saveMeetingCommitments(
  db: SupabaseClient,
  analysis: Record<string, any>,
  refs: { memoId?: string | null; clientId?: string | null; projectId?: string | null; workflowRunId?: string | null },
) {
  const representative = (analysis.representativeCommitments ?? []) as CommitmentInput[];
  const client = (analysis.clientCommitments ?? []) as CommitmentInput[];
  const rows = [
    ...representative.map((item) => ({ item, ownerType: "representative" })),
    ...client.map((item) => ({ item, ownerType: "client" })),
  ].flatMap(({ item, ownerType }) => {
    const text = String(item.text || "").trim();
    if (!text) return [];
    return [{
      consultation_memo_id: refs.memoId ?? null,
      client_id: refs.clientId ?? null,
      project_id: refs.projectId ?? null,
      workflow_run_id: refs.workflowRunId ?? null,
      owner_type: ownerType,
      owner_name: item.ownerName || "",
      commitment: text,
      due_at: validDueAt(item.dueAt),
      source_text: text.slice(0, 2_000),
      confidence: 0.85,
      deduplication_key: commitmentKey(refs.memoId ?? null, ownerType, text),
    }];
  });
  if (!rows.length) return [];
  const { data, error } = await db.from("meeting_commitments").upsert(rows, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}
