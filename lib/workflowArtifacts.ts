export const WORKFLOW_ARTIFACT_TYPES = ["quote", "contract", "conti"] as const;

export type WorkflowArtifactType = typeof WORKFLOW_ARTIFACT_TYPES[number];

export type WorkflowArtifact = {
  id: string;
  client_id: string;
  workflow_run_id: string | null;
  workflow_step_key: string;
  document_type: WorkflowArtifactType;
  source_table: string;
  source_id: string;
  title: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  status: "ready" | "upload_failed";
  created_at: string;
};

type UploadWorkflowArtifactInput = {
  file: Blob;
  fileName: string;
  documentType: WorkflowArtifactType;
  sourceTable: "quotes" | "contracts" | "conti_saves";
  sourceId: string;
  title: string;
  hospitalName?: string;
  clientId?: string | null;
  workflowRunId?: string | null;
};

export async function uploadWorkflowArtifact(input: UploadWorkflowArtifactInput) {
  const form = new FormData();
  form.set("file", input.file, input.fileName);
  form.set("fileName", input.fileName);
  form.set("documentType", input.documentType);
  form.set("sourceTable", input.sourceTable);
  form.set("sourceId", input.sourceId);
  form.set("title", input.title);
  if (input.hospitalName) form.set("hospitalName", input.hospitalName);
  if (input.clientId) form.set("clientId", input.clientId);
  if (input.workflowRunId) form.set("workflowRunId", input.workflowRunId);

  const response = await fetch("/api/workflow-artifacts", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(body?.error || "원본 PDF 업로드에 실패했습니다.");
  return body.artifact as WorkflowArtifact;
}

export async function openWorkflowArtifact(id: string, mode: "view" | "download") {
  const previewWindow = mode === "view" ? window.open("about:blank", "_blank") : null;
  if (previewWindow) previewWindow.opener = null;
  try {
    const response = await fetch(`/api/workflow-artifacts/${encodeURIComponent(id)}/access?mode=${mode}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body.url) throw new Error(body?.error || "파일 주소를 만들지 못했습니다.");
    if (previewWindow) previewWindow.location.href = body.url;
    else window.location.assign(body.url);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}

export function formatArtifactSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
