type ClaimedWorkerJob = {
  action?: unknown;
  payload?: unknown;
};

type WorkerJobPayload = Record<string, unknown>;

/**
 * Server-side execution policy applied when a worker claims a job.
 *
 * The SQL claim migration writes the same values. Keeping this policy at the
 * delivery boundary makes deployments safe when application code reaches
 * production before the database migration is applied.
 */
export function applyPhotoWorkerJobPolicy(job: ClaimedWorkerJob): WorkerJobPayload {
  const payload = isRecord(job.payload) ? job.payload : {};

  if (job.action !== "PHOTO_CLASSIFY_WORK") {
    return payload;
  }

  return {
    ...payload,
    ai_naming_enabled: true,
    profile_classification_enabled: false,
  };
}

function isRecord(value: unknown): value is WorkerJobPayload {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
