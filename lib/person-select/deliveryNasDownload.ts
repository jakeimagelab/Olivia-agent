import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PERSON_SELECT_DOWNLOAD_BUCKET } from "@/lib/person-select/downloads";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";

type DeliveryDownloadScope = {
  eventId: string;
  personId?: string | null;
  title: string;
};

type RemoteJobRow = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  payload: Record<string, unknown> | null;
  progress: { current?: number; total?: number; message?: string } | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at?: string;
};

export class DeliveryNasDownloadUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryNasDownloadUnavailableError";
  }
}

function scopeKey(scope: DeliveryDownloadScope) {
  return scope.personId ? `${scope.eventId}:person:${scope.personId}` : `${scope.eventId}:shared`;
}

function safeDownloadName(value: string) {
  const next = value.normalize("NFC").replace(/[\\/:*?"<>|]/gu, "_").trim();
  return `${next || "보정본"}_보정본.zip`;
}

export async function deliveryBundleFingerprint(db: SupabaseClient, scope: DeliveryDownloadScope) {
  let query = db.from("person_select_deliveries").select("id,current_version").eq("event_id", scope.eventId);
  query = scope.personId ? query.eq("person_id", scope.personId) : query.is("person_id", null);
  const { data, error } = await query.order("id");
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) throw new Error("전달할 보정본이 없습니다.");
  return {
    photoCount: rows.length,
    fingerprint: createHash("sha256")
      .update(rows.map((row) => `${row.id}:${row.current_version}`).join("|"))
      .digest("hex")
      .slice(0, 32),
  };
}

function publicJob(job: RemoteJobRow, download?: { url: string; fileName: string }) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress ?? null,
    ...(download ? { downloadUrl: download.url, fileName: download.fileName } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

export async function createDeliveryNasDownloadJob(db: SupabaseClient, scope: DeliveryDownloadScope) {
  const workerId = getConfiguredWorkerId();
  const { data: worker, error: workerError } = await db.from("remote_workers")
    .select("last_seen_at").eq("worker_id", workerId).maybeSingle();
  if (workerError) throw new DeliveryNasDownloadUnavailableError("Mac Studio 연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const lastSeenAt = worker?.last_seen_at ? new Date(worker.last_seen_at).getTime() : Number.NaN;
  if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > 2 * 60 * 1_000) {
    throw new DeliveryNasDownloadUnavailableError("Mac Studio가 꺼져 있어 NAS 보정본을 준비할 수 없습니다. 포토클리닉에 요청해 주세요.");
  }
  const { fingerprint, photoCount } = await deliveryBundleFingerprint(db, scope);
  const key = scopeKey(scope);
  const base = db.from("remote_jobs")
    .select("id,status,payload,progress,result,error,created_at")
    .eq("action", "PERSON_SELECT_DELIVERY_DOWNLOAD")
    .eq("payload->>scope_key", key)
    .eq("payload->>fingerprint", fingerprint)
    .order("created_at", { ascending: false });
  const { data: active } = await base.in("status", ["QUEUED", "RUNNING"]).limit(1).maybeSingle();
  if (active) return publicJob(active as RemoteJobRow);
  const { data: recent } = await db.from("remote_jobs")
    .select("id,status,payload,progress,result,error,created_at")
    .eq("action", "PERSON_SELECT_DELIVERY_DOWNLOAD")
    .eq("payload->>scope_key", key)
    .eq("payload->>fingerprint", fingerprint)
    .eq("status", "COMPLETED")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent && typeof (recent.result as Record<string, unknown> | null)?.storagePath === "string") {
    return publicJob(recent as RemoteJobRow);
  }
  const payload = {
    event_id: scope.eventId,
    ...(scope.personId ? { person_id: scope.personId } : {}),
    scope_key: key,
    fingerprint,
    photo_count: photoCount,
  };
  const { data, error } = await db.from("remote_jobs").insert({
    action: "PERSON_SELECT_DELIVERY_DOWNLOAD",
    payload,
    target_worker: workerId,
    status: "QUEUED",
  }).select("id,status,payload,progress,result,error,created_at").single();
  if (error || !data) throw error ?? new Error("NAS 다운로드 작업을 만들지 못했습니다.");
  return publicJob(data as RemoteJobRow);
}

export async function readDeliveryNasDownloadJob(
  db: SupabaseClient,
  scope: DeliveryDownloadScope,
  jobId: string,
) {
  const { data, error } = await db.from("remote_jobs")
    .select("id,status,payload,progress,result,error,created_at")
    .eq("id", jobId)
    .eq("action", "PERSON_SELECT_DELIVERY_DOWNLOAD")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("다운로드 작업을 찾지 못했습니다.");
  const job = data as RemoteJobRow;
  if (job.payload?.scope_key !== scopeKey(scope) || job.payload?.event_id !== scope.eventId) {
    throw new Error("이 다운로드 작업을 볼 권한이 없습니다.");
  }
  if (job.status !== "COMPLETED") return publicJob(job);
  const storagePath = typeof job.result?.storagePath === "string" ? job.result.storagePath : "";
  if (!storagePath) throw new Error("완료된 ZIP 파일 경로가 없습니다.");
  const fileName = safeDownloadName(scope.title);
  const { data: signed, error: signError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET)
    .createSignedUrl(storagePath, 600, { download: fileName });
  if (signError) throw signError;
  return publicJob(job, { url: signed.signedUrl, fileName });
}
