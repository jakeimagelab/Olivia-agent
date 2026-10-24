import type { PhotoDepartmentResolution } from "./departmentResolver";

export type PhotoDepartmentContextInput = {
  clientId?: string;
  workflowRunId?: string;
  folderName?: string;
};

type PhotoDepartmentContextResponse = {
  ok?: boolean;
  resolution?: PhotoDepartmentResolution;
  error?: string;
};

export async function fetchPhotoDepartmentContext(
  input: PhotoDepartmentContextInput,
  options: { signal?: AbortSignal } = {},
): Promise<PhotoDepartmentResolution> {
  const params = new URLSearchParams();
  if (input.clientId) params.set("clientId", input.clientId);
  if (input.workflowRunId) params.set("workflowRunId", input.workflowRunId);
  if (input.folderName) params.set("folderName", input.folderName);
  const response = await fetch(`/api/photo-classification/department-context?${params.toString()}`, {
    cache: "no-store",
    signal: options.signal,
  });
  const body = await response.json().catch(() => ({})) as PhotoDepartmentContextResponse;
  if (!response.ok || !body.ok || !body.resolution) {
    throw new Error(body.error || "진료과 정보를 확인하지 못했습니다.");
  }
  return body.resolution;
}
