import { getSupabaseAdmin } from "@/lib/supabase";
import { uploadJobStatusFromCounts, type PersonSelectUploadJobStatus } from "./uploadQueue";

export async function refreshPersonSelectUploadJob(jobId: string, options?: { keepStatus?: PersonSelectUploadJobStatus | null; error?: string | null }) {
  const db = getSupabaseAdmin();
  const { data: job } = await db.from("person_select_upload_jobs").select("id,status,total_count,started_at").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: files, error: filesError } = await db.from("person_select_upload_job_files").select("status").eq("job_id", jobId);
  if (filesError) throw new Error(filesError.message);
  const counts = { completed: 0, failed: 0, pending: 0, active: 0 };
  for (const file of files ?? []) {
    if (file.status === "completed") counts.completed += 1;
    else if (file.status === "failed") counts.failed += 1;
    else if (file.status === "uploading") counts.active += 1;
    else if (file.status === "pending") counts.pending += 1;
  }
  const preserved = options?.keepStatus ?? (job.status === "paused" || job.status === "canceled" ? job.status : null);
  const status = preserved ?? uploadJobStatusFromCounts({ total: Number(job.total_count), ...counts });
  const terminal = status === "completed" || status === "partial_failed" || status === "failed" || status === "canceled";
  const now = new Date().toISOString();
  const { data, error } = await db.from("person_select_upload_jobs").update({
    status,
    success_count: counts.completed,
    failed_count: counts.failed,
    pending_count: counts.pending,
    active_count: counts.active,
    started_at: job.started_at ?? (counts.active > 0 || counts.completed > 0 || counts.failed > 0 ? now : null),
    completed_at: terminal ? now : null,
    needs_file_reselection: !terminal && counts.active === 0 && counts.pending > 0,
    error: options?.error ?? null,
    updated_at: now,
  }).eq("id", jobId).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
