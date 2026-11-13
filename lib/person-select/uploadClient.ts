import type { PersonSelectImportLayout } from "./localImportRecords";
import type { PersonSelectUploadJob, UploadManifestFile } from "./uploadQueue";
import type { PersonSelectUploadJobFile } from "./uploadRuntime";

type UploadJsonBody = {
  ok?: boolean;
  error?: string;
  job?: PersonSelectUploadJob;
  jobs?: PersonSelectUploadJob[];
  files?: PersonSelectUploadJobFile[];
  completedPaths?: unknown[];
};

async function readUploadJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<UploadJsonBody>;
}

export async function loadPersonSelectUploadJobs(limit = 20) {
  const response = await fetch(`/api/person-select/upload-jobs?limit=${limit}`, { cache: "no-store" });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok) return null;
  return body.jobs ?? [];
}

export async function updatePersonSelectUploadJob(
  job: Pick<PersonSelectUploadJob, "id" | "event_id">,
  update: Record<string, unknown>,
) {
  const response = await fetch(`/api/person-select/${job.event_id}/upload-jobs/${job.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok || !body.job) throw new Error(body.error || "업로드 상태를 저장하지 못했습니다.");
  return body.job;
}

export async function loadPersonSelectUploadJob(eventId: string, jobId: string) {
  const response = await fetch(`/api/person-select/${eventId}/upload-jobs/${jobId}`, { cache: "no-store" });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok || !body.job) throw new Error(body.error || "업로드 작업을 불러오지 못했습니다.");
  return { job: body.job, files: body.files ?? [] };
}

export async function preparePersonSelectLocalImport(
  eventId: string,
  layout: PersonSelectImportLayout,
  files: readonly Pick<UploadManifestFile, "relativePath" | "fileName">[],
) {
  const response = await fetch(`/api/person-select/${eventId}/local-import`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout, files }),
  });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok) throw new Error(body.error || "사진 업로드를 준비하지 못했습니다.");
}

export async function createPersonSelectUploadJob({
  eventId,
  layout,
  sourceName,
  files,
}: {
  eventId: string;
  layout: PersonSelectImportLayout;
  sourceName: string;
  files: readonly UploadManifestFile[];
}) {
  const response = await fetch(`/api/person-select/${eventId}/upload-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout, sourceName, files }),
  });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok || !body.job) throw new Error(body.error || "업로드 작업을 만들지 못했습니다.");
  return {
    job: body.job,
    completedPaths: Array.isArray(body.completedPaths) ? body.completedPaths.map(String) : [],
  };
}

export async function uploadPersonSelectDerivative(
  eventId: string,
  form: FormData,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/person-select/${eventId}/local-import`, {
    method: "POST",
    body: form,
    signal,
  });
  const body = await readUploadJson(response);
  if (!response.ok || !body.ok) throw new Error(body.error || "업로드 실패");
}
