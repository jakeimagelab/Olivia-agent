import type { LocalPersonSelectCandidate } from "./localImportRecords";
import type { PersonSelectUploadRuntime } from "./uploadRuntime";

export type PersonSelectUploadDerivative = {
  sourceWidth: number;
  sourceHeight: number;
  thumb: Blob;
  preview: Blob;
};

export type PersonSelectUploadExecutionDependencies = {
  checkpoint(body: Record<string, unknown>): Promise<unknown>;
  createDerivatives(file: File): Promise<PersonSelectUploadDerivative>;
  upload(eventId: string, form: FormData, signal: AbortSignal): Promise<void>;
  delay(milliseconds: number): Promise<void>;
  onDeferredCheckpoint?(phase: "failure", error: unknown): void;
};

export type PersonSelectUploadExecutionOptions = {
  concurrency?: number;
  maxRetries?: number;
};

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 2;

function enqueuePath(runtime: PersonSelectUploadRuntime, relativePath: string) {
  if (runtime.queue.includes(relativePath) || runtime.canceled) return;
  if (runtime.paused) runtime.queue.unshift(relativePath);
  else runtime.queue.push(relativePath);
}

function createDerivativeForm(
  jobId: string,
  runtime: PersonSelectUploadRuntime,
  candidate: LocalPersonSelectCandidate,
  derivative: PersonSelectUploadDerivative,
) {
  const form = new FormData();
  form.set("layout", runtime.layout);
  form.set("relativePath", candidate.relativePath);
  form.set("sortOrder", String(runtime.sortOrderByPath.get(candidate.relativePath) ?? 0));
  form.set("sourceWidth", String(derivative.sourceWidth));
  form.set("sourceHeight", String(derivative.sourceHeight));
  form.set("uploadJobId", jobId);
  form.set("thumb", derivative.thumb, `${candidate.fileName}.thumb.jpg`);
  form.set("preview", derivative.preview, `${candidate.fileName}.preview.jpg`);
  return form;
}

export async function executePersonSelectUploadPath({
  jobId,
  runtime,
  relativePath,
  dependencies,
  maxRetries = DEFAULT_MAX_RETRIES,
}: {
  jobId: string;
  runtime: PersonSelectUploadRuntime;
  relativePath: string;
  dependencies: PersonSelectUploadExecutionDependencies;
  maxRetries?: number;
}) {
  const candidate = runtime.files.get(relativePath);
  if (!candidate) return;

  const attempt = (runtime.attempts.get(relativePath) ?? 0) + 1;
  runtime.attempts.set(relativePath, attempt);
  const controller = new AbortController();
  runtime.controllers.add(controller);

  try {
    await dependencies.checkpoint({ action: "file_uploading", relativePath, attempts: attempt });
    const derivative = await dependencies.createDerivatives(candidate.file);
    if (runtime.paused || runtime.canceled || controller.signal.aborted) {
      if (runtime.paused && !runtime.canceled) enqueuePath(runtime, relativePath);
      return;
    }
    await dependencies.upload(
      runtime.eventId,
      createDerivativeForm(jobId, runtime, candidate, derivative),
      controller.signal,
    );
  } catch (error) {
    if (controller.signal.aborted || runtime.paused || runtime.canceled) {
      if (runtime.paused && !runtime.canceled) enqueuePath(runtime, relativePath);
      return;
    }
    if (attempt <= maxRetries) {
      await dependencies.delay(350 * attempt);
      enqueuePath(runtime, relativePath);
      return;
    }
    try {
      await dependencies.checkpoint({
        action: "file_failed",
        relativePath,
        attempts: attempt,
        error: error instanceof Error ? error.message : "업로드 실패",
      });
    } catch (checkpointError) {
      enqueuePath(runtime, relativePath);
      dependencies.onDeferredCheckpoint?.("failure", checkpointError);
    }
  } finally {
    runtime.controllers.delete(controller);
  }
}

export async function pumpPersonSelectUploadRuntime({
  jobId,
  runtime,
  dependencies,
  options = {},
}: {
  jobId: string;
  runtime: PersonSelectUploadRuntime;
  dependencies: PersonSelectUploadExecutionDependencies;
  options?: PersonSelectUploadExecutionOptions;
}) {
  if (runtime.pumping || runtime.paused || runtime.canceled) return false;
  runtime.pumping = true;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  try {
    const worker = async () => {
      while (!runtime.paused && !runtime.canceled) {
        const relativePath = runtime.queue.shift();
        if (!relativePath) return;
        await executePersonSelectUploadPath({
          jobId,
          runtime,
          relativePath,
          dependencies,
          maxRetries: options.maxRetries,
        });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, runtime.queue.length)) },
        () => worker(),
      ),
    );
    return true;
  } finally {
    runtime.pumping = false;
  }
}
