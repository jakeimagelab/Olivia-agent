export const OLIVIA_ATTACHMENT_BUCKET = "olivia-chat-attachments";
export const OLIVIA_ATTACHMENT_MAX_FILES = 5;
export const OLIVIA_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OLIVIA_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export type OliviaAttachmentKind = "image" | "pdf" | "text" | "spreadsheet" | "file";
export type OliviaChatAttachment = {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: OliviaAttachmentKind;
  analysisStatus: "supported" | "stored_only";
  downloadUrl?: string;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const TEXT_EXTENSIONS = new Set(["txt", "csv"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx"]);
const STORED_ONLY_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "zip"]);
const BLOCKED_MIME_PATTERN = /(?:javascript|html|svg|x-msdownload|x-sh|x-executable)/i;
const STORAGE_PATH_PATTERN = /^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,180}$/;

function extensionOf(fileName: string) {
  const extension = fileName.trim().split(".").pop()?.toLowerCase() ?? "";
  return extension === fileName.toLowerCase() ? "" : extension;
}

export function classifyOliviaAttachment(fileName: string, mimeType = ""): OliviaAttachmentKind | null {
  const extension = extensionOf(fileName);
  if (BLOCKED_MIME_PATTERN.test(mimeType)) return null;
  if (IMAGE_EXTENSIONS.has(extension) && /^image\/(?:jpeg|png|gif|webp)$/i.test(mimeType)) return "image";
  if (extension === "pdf" && mimeType === "application/pdf") return "pdf";
  if (TEXT_EXTENSIONS.has(extension) && (!mimeType || /^(?:text\/|application\/(?:csv|vnd\.ms-excel))/i.test(mimeType))) return "text";
  if (SPREADSHEET_EXTENSIONS.has(extension) && (!mimeType || /(?:spreadsheet|excel|octet-stream)/i.test(mimeType))) return "spreadsheet";
  if (STORED_ONLY_EXTENSIONS.has(extension) && (!mimeType || !BLOCKED_MIME_PATTERN.test(mimeType))) return "file";
  return null;
}

export function validateOliviaAttachmentInput(input: {
  fileName: string;
  mimeType?: string;
  fileSize: number;
}) {
  const fileName = input.fileName.normalize("NFC").trim();
  if (!fileName || fileName.length > 180) return { ok: false as const, error: "파일명은 1~180자여야 합니다." };
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) return { ok: false as const, error: "빈 파일은 첨부할 수 없습니다." };
  if (input.fileSize > OLIVIA_ATTACHMENT_MAX_FILE_BYTES) return { ok: false as const, error: "파일 하나는 최대 10MB까지 첨부할 수 있습니다." };
  const mimeType = String(input.mimeType || "application/octet-stream").toLowerCase();
  const kind = classifyOliviaAttachment(fileName, mimeType);
  if (!kind) return { ok: false as const, error: "지원하지 않는 파일 형식입니다." };
  return {
    ok: true as const,
    value: {
      fileName,
      mimeType,
      fileSize: input.fileSize,
      kind,
      analysisStatus: kind === "file" ? "stored_only" as const : "supported" as const,
    },
  };
}

export function isValidOliviaAttachmentPath(path: string) {
  return STORAGE_PATH_PATTERN.test(path);
}

export function sanitizeOliviaAttachments(value: unknown): OliviaChatAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: OliviaChatAttachment[] = [];
  let totalBytes = 0;
  for (const item of value.slice(0, OLIVIA_ATTACHMENT_MAX_FILES)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const storagePath = String(row.storagePath || "");
    const validated = validateOliviaAttachmentInput({
      fileName: String(row.fileName || ""),
      mimeType: String(row.mimeType || "application/octet-stream"),
      fileSize: Number(row.sizeBytes),
    });
    if (!validated.ok || !isValidOliviaAttachmentPath(storagePath)) continue;
    if (totalBytes + validated.value.fileSize > OLIVIA_ATTACHMENT_MAX_TOTAL_BYTES) continue;
    totalBytes += validated.value.fileSize;
    attachments.push({
      id: String(row.id || "").slice(0, 80) || storagePath.split("/")[2],
      storagePath,
      fileName: validated.value.fileName,
      mimeType: validated.value.mimeType,
      sizeBytes: validated.value.fileSize,
      kind: validated.value.kind,
      analysisStatus: validated.value.analysisStatus,
      ...(typeof row.downloadUrl === "string" ? { downloadUrl: row.downloadUrl.slice(0, 2000) } : {}),
    });
  }
  return attachments;
}

export function validateOliviaAttachmentBatch(files: Array<{ name: string; type?: string; size: number }>) {
  if (files.length > OLIVIA_ATTACHMENT_MAX_FILES) return "메시지당 파일은 최대 5개까지 첨부할 수 있습니다.";
  if (files.reduce((sum, file) => sum + file.size, 0) > OLIVIA_ATTACHMENT_MAX_TOTAL_BYTES) {
    return "첨부파일 전체 용량은 최대 25MB입니다.";
  }
  for (const file of files) {
    const result = validateOliviaAttachmentInput({ fileName: file.name, mimeType: file.type, fileSize: file.size });
    if (!result.ok) return `${file.name}: ${result.error}`;
  }
  return null;
}
